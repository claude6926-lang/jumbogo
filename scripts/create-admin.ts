import { randomUUID } from 'node:crypto';
import { db, transaction, audit } from '../src/lib/server/db';
import { hashPassword } from '../src/lib/server/auth-store';
import { accountSchema, passwordSchema } from '../src/lib/auth-domain';
async function main() {
    const input = accountSchema.parse({ name: process.env.ADMIN_NAME || 'JUMBO GO Admin', email: process.env.ADMIN_EMAIL, phone: process.env.ADMIN_PHONE, role: 'user', consent: true });
    const password = passwordSchema.parse(process.env.ADMIN_PASSWORD);
    if ((await db.prepare('SELECT user_id FROM accounts WHERE email=? OR phone=?').get(input.email, input.phone)))
        throw new Error('Account already exists; do not overwrite an existing account.');
    const hash = await hashPassword(password);
    const id = randomUUID();
    (await transaction(async () => { (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(id, input.name, input.phone, 'admin')); (await db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?)').run(id, input.email, input.phone, 'admin', hash, new Date().toISOString())); (await audit(id, 'ADMIN_CREATED_BY_LOCAL_OPERATOR', {})); }));
    console.log('Administrator created. Sign in through /user/login with the supplied credentials.');
}
main().catch(() => { console.error('Admin creation failed. Check ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD (10+ letters/numbers), and that the account is new.'); process.exitCode = 1; });
