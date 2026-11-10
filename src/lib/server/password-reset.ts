import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { db, transaction, audit } from './db';
import { AuthError, hashPassword, rateLimit } from './auth-store';
import { passwordSchema } from '../auth-domain';
(await db.migrate(`CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);`));
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const roleSchema = z.enum(['user', 'driver', 'admin']);
const requestSchema = z.object({ email: z.string().trim().email().max(254).transform(s => s.toLowerCase()), role: roleSchema });
const resetSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema, confirmPassword: z.string().max(128) }).refine(v => v.password === v.confirmPassword, { message: 'Passwords must match' });
function delivery() {
    const url = new URL(process.env.APP_URL || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
        throw new AuthError(503, 'RESET_NOT_CONFIGURED');
    if (process.env.PASSWORD_RESET_DELIVERY === 'local-file' && ['127.0.0.1', 'localhost'].includes(url.hostname))
        return { mode: 'local-file' as const, origin: url.origin };
    if (process.env.PASSWORD_RESET_DELIVERY === 'resend' && process.env.RESEND_API_KEY && process.env.MAIL_FROM)
        return { mode: 'email' as const, origin: url.origin };
    throw new AuthError(503, 'RESET_NOT_CONFIGURED');
}
export function recoveryMode() { try {
    return delivery().mode;
}
catch {
    return 'unavailable';
} }
export async function requestPasswordReset(body: unknown) {
    const input = requestSchema.parse(body);
    (await rateLimit('password-reset-global', 60, 3600000));
    (await rateLimit(`password-reset:${input.role}:${input.email}`, 5, 3600000));
    const config = delivery();
    const account = (await db.prepare('SELECT user_id,password_hash FROM accounts WHERE email=? AND role=?').get(input.email, input.role)) as {
        user_id: string;
        password_hash: string | null;
    } | undefined;
    // Passwordless social accounts must recover with their original provider.
    if (!account?.password_hash)
        return { ok: true, delivery: config.mode };
    const token = randomBytes(32).toString('hex'), hash = digest(token), expires = Date.now() + 15 * 60000;
    (await db.prepare('DELETE FROM password_resets WHERE expires<=?').run(Date.now()));
    (await db.prepare('INSERT INTO password_resets VALUES(?,?,?)').run(hash, account.user_id, expires));
    const link = new URL('/auth/reset-password', config.origin);
    // Fragment is not sent in HTTP requests, access logs or referrer headers.
    link.hash = new URLSearchParams({ token, role: input.role }).toString();
    try {
        const text = `JUMBO GO — ตั้งรหัสผ่านใหม่ / Reset your password\n\n${link.href}\n\nลิงก์ใช้ได้ครั้งเดียว ภายใน 15 นาที / This link expires in 15 minutes and can be used once.\nหากไม่ได้ส่งคำขอ สามารถละเว้นข้อความนี้ / Ignore this message if you did not request a reset.`;
        if (config.mode === 'local-file') {
            const folder = join(dirname(process.env.DATABASE_PATH || './data/jumbogo.db'), 'reset-outbox');
            await mkdir(folder, { recursive: true, mode: 0o700 });
            await writeFile(join(folder, `${Date.now()}-${randomUUID()}.txt`), `LOCAL DEMO ONLY — no email sent\nTo: ${input.email}\nRole: ${input.role}\nExpires: ${new Date(expires).toISOString()}\n\n${text}`, { flag: 'wx', mode: 0o600 });
        }
        else {
            const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `password-reset-${hash}` }, body: JSON.stringify({ from: process.env.MAIL_FROM, to: [input.email], subject: 'JUMBO GO — Reset your password', text }), signal: AbortSignal.timeout(10000) });
            if (!response.ok)
                throw new Error('Email delivery failed');
        }
        (await audit(account.user_id, 'PASSWORD_RESET_REQUESTED', { delivery: config.mode }));
    }
    catch {
        (await db.prepare('DELETE FROM password_resets WHERE token_hash=?').run(hash));
        (await audit(account.user_id, 'PASSWORD_RESET_DELIVERY_FAILED', {}));
        // Same public response, whether an account exists or delivery fails.
    }
    return { ok: true, delivery: config.mode };
}
export async function resetPassword(body: unknown) {
    const input = resetSchema.parse(body);
    (await rateLimit('password-reset-confirm-global', 120, 60000));
    const tokenHash = digest(input.token);
    if (!(await db.prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND expires>?').get(tokenHash, Date.now())))
        throw new AuthError(400, 'RESET_EXPIRED');
    const passwordHash = await hashPassword(input.password);
    return (await transaction(async () => {
        // Recheck after hashing, then consume all links and sessions atomically.
        const row = (await db.prepare('SELECT r.user_id,a.role FROM password_resets r JOIN accounts a ON a.user_id=r.user_id WHERE r.token_hash=? AND r.expires>? AND a.password_hash IS NOT NULL').get(tokenHash, Date.now())) as {
            user_id: string;
            role: string;
        } | undefined;
        if (!row)
            throw new AuthError(400, 'RESET_EXPIRED');
        (await db.prepare('UPDATE accounts SET password_hash=? WHERE user_id=?').run(passwordHash, row.user_id));
        (await db.prepare('DELETE FROM password_resets WHERE user_id=?').run(row.user_id));
        (await db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id));
        (await audit(row.user_id, 'PASSWORD_RESET_COMPLETED', {}));
        return { ok: true, next: `/${row.role}/login` };
    }));
}
