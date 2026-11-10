import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
process.env.DATABASE_PATH = ':memory:';
process.env.DEMO_MODE = 'true';
process.env.DOCUMENT_ENCRYPTION_KEY = 'a'.repeat(64);
test('new customers receive 100 once across signup methods; failed signup rolls back and drivers are excluded', async () => {
    const { db, balance } = await import('../src/lib/server/db');
    const { createAccount, googleCustomer } = await import('../src/lib/server/auth-store');
    const { POST } = await import('../src/app/api/v1/[...path]/route');
    let i = 0;
    for (const provider of ['password', 'google', 'facebook']) {
        i++;
        const input = { name: 'New customer', email: `${provider}@example.com`, phone: `081234567${i}`, role: 'user' as const };
        const id = (await createAccount(input, provider === 'password' ? 'hash' : null, provider === 'password' ? undefined : { provider, subject: 'subject-' + provider }));
        assert.equal((await balance(id)), 100);
        assert.equal((await db.prepare("SELECT COUNT(*) n FROM ledger WHERE user_id=? AND kind='WELCOME'").get(id))?.n, 1);
        (await assert.rejects(async () => (await createAccount(input, 'hash')), /ACCOUNT_EXISTS/));
        assert.equal((await balance(id)), 100);
        (await db.prepare('UPDATE users SET verified=1 WHERE id=?').run(id));
        (await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('session-' + id, id, Date.now() + 60000));
        const req = new NextRequest('http://localhost:3000/api/v1/wallet/claim', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', cookie: 'jumbo_session=session-' + id, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'JUMBO100' }) });
        const res = await POST(req, { params: Promise.resolve({ path: ['wallet', 'claim'] }) });
        assert.equal(res.status, 409);
        assert.equal((await res.json()).error, 'CREDIT_ALREADY_CLAIMED');
        assert.equal((await balance(id)), 100);
    }
    const legacy = (await googleCustomer('legacy-subject', 'Google user', 'legacy@example.com'));
    assert.equal((await balance(legacy)), 100);
    assert.equal((await googleCustomer('legacy-subject', 'Google user', 'legacy@example.com')), legacy);
    assert.equal((await balance(legacy)), 100);
    const driver = (await createAccount({ name: 'Driver', email: 'driver@example.com', phone: '0899999999', role: 'driver' }, 'hash'));
    assert.equal((await balance(driver)), 0);
    const before = (await db.prepare('SELECT COUNT(*) n FROM ledger').get())!.n;
    (await assert.rejects(async () => (await createAccount({ name: 'Failed customer', email: 'failed@example.com', phone: '0888888888', role: 'user' }, 'hash', undefined, () => { throw new Error('Storage failure'); })), /Storage failure/));
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM ledger').get())!.n, before);
    assert.equal((await db.prepare("SELECT COUNT(*) n FROM accounts WHERE email='failed@example.com'").get())!.n, 0);
});
