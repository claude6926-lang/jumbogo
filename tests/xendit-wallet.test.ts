import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Session } from '../src/lib/domain';
process.env.DATABASE_PATH = ':memory:';
process.env.DEMO_MODE = 'false';
process.env.DOCUMENT_ENCRYPTION_KEY = 'a'.repeat(64);

test('Xendit test payments verify provider results, ownership and callback, and never credit real money', async () => {
    const { db, balance } = await import('../src/lib/server/db');
    const p = await import('../src/lib/server/wallet-payments');
    const user: Session = { id: 'x-user', name: 'Test', phone: '', role: 'user' };
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(user.id, user.name, '', user.role);
    process.env.WALLET_PAYMENT_MODE = 'xendit_test';
    process.env.XENDIT_SECRET_KEY = 'xnd_production_fixture';
    await assert.rejects(p.createPayment(user, { amount: 100, idem: randomUUID() }), /TEST_KEY_REQUIRED/);
    process.env.XENDIT_SECRET_KEY = 'xnd_development_fixture';
    process.env.XENDIT_WEBHOOK_TOKEN = 'fixture-token';
    const original = globalThis.fetch;
    let reference = '', amount = 100, status = 'REQUIRES_ACTION', creates = 0;
    globalThis.fetch = async (url, init) => {
        assert.ok(String(url).startsWith('https://api.xendit.co/v3/payment_requests'));
        if (String(url).endsWith('/simulate')) return Response.json({ status: 'PENDING' });
        if (init?.method === 'POST') {
            const body = JSON.parse(String(init.body)); reference = body.reference_id; creates++;
            assert.equal(body.request_amount, 100); assert.equal(body.channel_code, 'QRPROMPTPAY');
        }
        return Response.json({ payment_request_id: 'pr-fixture', reference_id: reference, request_amount: amount,
            country: 'TH', currency: 'THB', type: 'PAY', capture_method: 'AUTOMATIC', channel_code: 'QRPROMPTPAY', status,
            actions: [{ type: 'PRESENT_TO_CUSTOMER', descriptor: 'QR_STRING', value: 'TEST-NOT-PAYABLE' }] });
    };
    try {
        const input = { amount: 100, idem: randomUUID() };
        const payment = await p.createPayment(user, input);
        assert.ok(payment.qr?.startsWith('data:image/png;base64,'));
        assert.equal((await p.createPayment(user, input)).id, payment.id); assert.equal(creates, 1);
        await assert.rejects(p.simulateXendit({ ...user, id: 'other' }, { id: payment.id }), /FORBIDDEN/);
        await p.simulateXendit(user, { id: payment.id });
        assert.equal((await p.paymentList(user)).testBalance, 0);
        const event = { event: 'payment.capture', data: { payment_request_id: 'pr-fixture' } };
        await assert.rejects(p.xenditWebhook(event, 'wrong'), /INVALID_CALLBACK_TOKEN/);
        await p.xenditWebhook(event, 'fixture-token');
        assert.equal((await p.paymentList(user)).testBalance, 0);
        status = 'SUCCEEDED'; amount = 101;
        await assert.rejects(p.xenditWebhook(event, 'fixture-token'), /PAYMENT_MISMATCH/);
        amount = 100; reference = 'wrong-reference';
        await assert.rejects(p.refreshPayment(user, payment.id), /PAYMENT_MISMATCH/);
        reference = payment.id;
        await p.xenditWebhook(event, 'fixture-token');
        await p.xenditWebhook(event, 'fixture-token');
        assert.equal((await p.paymentList(user)).testBalance, 100);
        assert.equal(await balance(user.id), 0);
        assert.equal((await p.receipt(user, payment.id)).testOnly, true);
    } finally { globalThis.fetch = original; }
});
