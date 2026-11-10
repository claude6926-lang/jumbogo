import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
process.env.DATABASE_PATH = ':memory:';
process.env.APP_URL = 'https://127.0.0.1:3000';
process.env.PASSWORD_RESET_DELIVERY = 'resend';
process.env.RESEND_API_KEY = 'test-key';
process.env.MAIL_FROM = 'test@example.com';
process.env.DEMO_MODE = 'false';
test('password reset tokens expire, are single use, scoped to roles, revoke sessions and never expose tokens', async () => {
    const { db } = await import('../src/lib/server/db');
    const { hashPassword, checkPassword } = await import('../src/lib/server/auth-store');
    const { requestPasswordReset, resetPassword, recoveryMode } = await import('../src/lib/server/password-reset');
    const { POST } = await import('../src/app/api/auth/[...path]/route');
    const hash = await hashPassword('OldPassword123');
    const at = new Date().toISOString();
    for (const role of ['user', 'driver', 'admin']) {
        (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(role, role, '', role));
        (await db.prepare('INSERT INTO accounts VALUES(?,?,NULL,?,?,?)').run(role, 'same@example.com', role, hash, at));
    }
    (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run('social', 'Social', '', 'user'));
    (await db.prepare('INSERT INTO accounts VALUES(?,?,NULL,?,NULL,?)').run('social', 'social@example.com', 'user', at));
    (await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('old-session', 'user', Date.now() + 60000));
    const originalFetch = globalThis.fetch;
    const messages: string[] = [];
    globalThis.fetch = async (_url, init) => { messages.push(JSON.parse(String(init?.body)).text); return new Response('{}', { status: 200 }); };
    const token = () => new URLSearchParams(new URL(messages.at(-1)!.match(/https:\/\/\S+/)![0]).hash.slice(1)).get('token')!;
    try {
        const result = await requestPasswordReset({ email: 'SAME@example.com', role: 'user' });
        const first = token();
        assert.deepEqual(result, await requestPasswordReset({ email: 'missing@example.com', role: 'user' }));
        assert.deepEqual(result, await requestPasswordReset({ email: 'social@example.com', role: 'user' }));
        assert.equal(messages.length, 1);
        assert.equal(JSON.stringify(result).includes(first), false);
        const row = (await db.prepare('SELECT token_hash FROM password_resets').get());
        assert.notEqual(row?.token_hash, first);
        assert.equal(row?.token_hash, createHash('sha256').update(first).digest('hex'));
        await requestPasswordReset({ email: 'same@example.com', role: 'user' });
        const second = token();
        await assert.rejects(resetPassword({ token: first, password: 'short', confirmPassword: 'short' }));
        await assert.rejects(resetPassword({ token: first, password: 'NewPassword123', confirmPassword: 'Different123' }));
        await assert.rejects(resetPassword({ token: 'f'.repeat(64), password: 'NewPassword123', confirmPassword: 'NewPassword123' }), /RESET_EXPIRED/);
        const reset = await resetPassword({ token: first, password: 'NewPassword123', confirmPassword: 'NewPassword123' });
        assert.equal(reset.next, '/user/login');
        assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get('user'))?.n, 0);
        await assert.rejects(resetPassword({ token: first, password: 'AnotherPassword123', confirmPassword: 'AnotherPassword123' }), /RESET_EXPIRED/);
        await assert.rejects(resetPassword({ token: second, password: 'AnotherPassword123', confirmPassword: 'AnotherPassword123' }), /RESET_EXPIRED/);
        const user = (await db.prepare('SELECT password_hash FROM accounts WHERE user_id=?').get('user'));
        assert.equal(await checkPassword('NewPassword123', String(user?.password_hash)), true);
        assert.equal(await checkPassword('OldPassword123', String(user?.password_hash)), false);
        assert.equal((await db.prepare('SELECT password_hash FROM accounts WHERE user_id=?').get('driver'))?.password_hash, hash);
        await requestPasswordReset({ email: 'same@example.com', role: 'driver' });
        const expired = token();
        (await db.prepare('UPDATE password_resets SET expires=0 WHERE user_id=?').run('driver'));
        await assert.rejects(resetPassword({ token: expired, password: 'NewPassword123', confirmPassword: 'NewPassword123' }), /RESET_EXPIRED/);
        await requestPasswordReset({ email: 'same@example.com', role: 'admin' });
        const adminToken = token();
        assert.equal((await resetPassword({ token: adminToken, password: 'NewPassword123', confirmPassword: 'NewPassword123' })).next, '/admin/login');
        const req = new NextRequest('https://127.0.0.1:3000/api/auth/forgot-password', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'same@example.com', role: 'user' }) });
        assert.equal((await POST(req, { params: Promise.resolve({ path: ['forgot-password'] }) })).status, 403);
        globalThis.fetch = async () => new Response('{}', { status: 500 });
        await requestPasswordReset({ email: 'same@example.com', role: 'driver' });
        assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE user_id=?').get('driver'))?.n, 0);
        process.env.PASSWORD_RESET_DELIVERY = 'local-file';
        process.env.APP_URL = 'https://public.example';
        assert.equal(recoveryMode(), 'unavailable');
    }
    finally {
        globalThis.fetch = originalFetch;
    }
});
