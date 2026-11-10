import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Session } from '../src/lib/domain';
process.env.DATABASE_PATH = ':memory:';
process.env.DEMO_MODE = 'false';
process.env.WALLET_PAYMENT_MODE = 'demo';
process.env.DOCUMENT_ENCRYPTION_KEY = 'a'.repeat(64);
test('automatic test wallet isolates money, enforces identity, handles expiry and verifies provider results', async () => {
    const { db, balance } = await import('../src/lib/server/db');
    const p = await import('../src/lib/server/wallet-payments');
    const user: Session = { id: 'user', name: 'Customer', phone: '', role: 'user' }, other: Session = { ...user, id: 'other' }, admin: Session = { ...user, id: 'admin', role: 'admin' };
    for (const u of [user, other, admin])
        (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(u.id, u.name, '', u.role));
    const input = { amount: 500, idem: randomUUID() }, first = await p.createPayment(user, input);
    assert.equal(first.status, 'PENDING');
    assert.equal((await p.createPayment(user, input)).id, first.id);
    await assert.rejects(p.createPayment(other, input), /IDEMPOTENCY_CONFLICT/);
    (await assert.rejects(async () => (await p.simulatePayment(user, { id: first.id, status: 'SUCCEEDED' })), /FORBIDDEN/));
    (await p.simulatePayment(admin, { id: first.id, status: 'SUCCEEDED' }));
    (await p.simulatePayment(admin, { id: first.id, status: 'SUCCEEDED' }));
    assert.equal((await p.paymentList(user)).testBalance, 500);
    assert.equal((await balance(user.id)), 0);
    assert.equal((await p.receipt(user, first.id)).testOnly, true);
    (await assert.rejects(async () => (await p.receipt(other, first.id)), /FORBIDDEN/));
    const expired = await p.createPayment(user, { amount: 100, idem: randomUUID() });
    (await db.prepare('UPDATE wallet_test_payments SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', expired.id));
    assert.equal((await p.simulatePayment(admin, { id: expired.id, status: 'SUCCEEDED' })).status, 'EXPIRED');
    assert.equal((await p.paymentList(user)).testBalance, 500);
    const failed = await p.createPayment(user, { amount: 100, idem: randomUUID() });
    (await p.simulatePayment(admin, { id: failed.id, status: 'FAILED' }));
    (await assert.rejects(async () => (await p.receipt(user, failed.id)), /PAYMENT_NOT_CONFIRMED/));
    process.env.WALLET_PAYMENT_MODE = 'omise_test';
    process.env.OMISE_SECRET_KEY = 'skey_live_wrong';
    await assert.rejects(p.createPayment(user, { amount: 100, idem: randomUUID() }), /TEST_KEY_REQUIRED/);
    process.env.OMISE_SECRET_KEY = 'skey_test_fixture';
    const oldFetch = globalThis.fetch;
    let id = '', amount = 20000, status = 'pending', paid = false, livemode = false;
    globalThis.fetch = async (_url, init) => {
        if (init?.method === 'POST') {
            const body = init.body as URLSearchParams;
            id = body.get('metadata[wallet_payment_id]')!;
        }
        return new Response(JSON.stringify({ id: 'chrg_test123', livemode, amount, currency: 'THB', status, paid, expires_at: new Date(Date.now() + 600000).toISOString(), metadata: { wallet_payment_id: id }, source: { type: 'promptpay', scannable_code: { image: { download_uri: 'https://api.omise.co/qr/test' } } } }), { status: 200 });
    };
    try {
        const remote = await p.createPayment(user, { amount: 200, idem: randomUUID() });
        assert.equal(remote.status, 'PENDING');
        (await assert.rejects(async () => (await p.simulatePayment(admin, { id: remote.id, status: 'SUCCEEDED' })), /SIMULATION_DISABLED/));
        await p.webhook({ key: 'charge.complete', data: { id: 'chrg_test123', status: 'successful', paid: true } });
        assert.equal((await p.paymentList(user)).testBalance, 500);
        status = 'successful';
        paid = true;
        amount = 19900;
        await assert.rejects(p.refreshPayment(user, remote.id), /PAYMENT_MISMATCH/);
        amount = 20000;
        livemode = true;
        await assert.rejects(p.refreshPayment(user, remote.id));
        livemode = false;
        await p.webhook({ key: 'charge.complete', data: { id: 'chrg_test123' } });
        await p.refreshPayment(user, remote.id);
        assert.equal((await p.paymentList(user)).testBalance, 700);
        assert.equal((await balance(user.id)), 0);
        assert.equal((await p.receipt(user, remote.id)).reference, 'chrg_test123');
    }
    finally {
        globalThis.fetch = oldFetch;
    }
    process.env.WALLET_PAYMENT_MODE = 'live';
    await assert.rejects(p.createPayment(user, { amount: 100, idem: randomUUID() }), /PAYMENTS_DISABLED/);
});
