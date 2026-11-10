import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_PATH = ':memory:';
test('Google customer signup is idempotent, has no fabricated phone, and cannot claim an existing account', async () => {
    const { db } = await import('../src/lib/server/db');
    // Exercise the old schema migration and preservation of existing data.
    (await db.exec(`CREATE TABLE accounts(user_id TEXT PRIMARY KEY REFERENCES users(id),email TEXT NOT NULL,phone TEXT NOT NULL,role TEXT NOT NULL,password_hash TEXT,created_at TEXT NOT NULL,UNIQUE(email,role),UNIQUE(phone,role));
 INSERT INTO users VALUES('existing','Existing','0812345678','user',0);
 INSERT INTO accounts VALUES('existing','existing@example.com','0812345678','user','preserved-hash','2026-09-25');`));
    const { googleCustomer } = await import('../src/lib/server/auth-store');
    const id = (await googleCustomer('subject-one', 'Google Customer', 'one@example.com'));
    assert.equal((await googleCustomer('subject-one', 'Changed', 'changed@example.com')), id);
    const second = (await googleCustomer('subject-two', 'Second', 'two@example.com'));
    assert.notEqual(second, id);
    assert.deepEqual({ ...(await db.prepare('SELECT phone,password_hash FROM accounts WHERE user_id=?').get(id)) }, { phone: null, password_hash: null });
    assert.equal((await db.prepare('SELECT phone FROM users WHERE id=?').get(id))?.phone, '');
    assert.equal((await db.prepare('SELECT password_hash FROM accounts WHERE user_id=?').get('existing'))?.password_hash, 'preserved-hash');
    (await assert.rejects(async () => (await googleCustomer('attacker', 'Attacker', 'existing@example.com')), /ACCOUNT_EXISTS/));
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM identities WHERE subject='attacker'").get())?.n, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM consents WHERE user_id=?').get(id))?.n, 0);
});
