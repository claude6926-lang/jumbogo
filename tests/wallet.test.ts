import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import type { Session } from '../src/lib/domain';
process.env.DATABASE_PATH = ':memory:';
process.env.DEMO_MODE = 'true';
process.env.DOCUMENT_ENCRYPTION_KEY = 'b'.repeat(64);
test('wallet: review once, private receipts, immutable money, fees and debt', async () => {
    const { db, balance, saveJob, vehicles } = await import('../src/lib/server/db');
    const s = await import('../src/lib/server/wallet-store');
    const { GET, POST } = await import('../src/app/api/wallet/[...path]/route');
    const people = ['admin', 'user', 'driver', 'other'].map(id => ({ id, name: id, phone: '', role: id === 'other' ? 'user' : id })) as Session[];
    for (const p of people) {
        (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(p.id, p.name, '', p.role));
        (await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(p.id, p.id, Date.now() + 600000));
    }
    const [admin, user, driver, other] = people;
    const bankId = (await s.saveBank(admin, { name: 'Test Bank', accountName: 'Test Company', accountNumber: '0001234567', active: true }, Buffer.from('qr')));
    const revision = (await s.banks())[0].revision;
    (await assert.rejects(async () => (await s.submitTopup(user, { amount: 500, bankId, revision: randomUUID(), idem: randomUUID() }, Buffer.from('stale-bank'))), /BANK_UNAVAILABLE/));
    (await assert.rejects(async () => (await s.saveBank(user, {}, Buffer.from('qr'))), /FORBIDDEN/));
    const idem = randomUUID(), topup = (await s.submitTopup(user, { amount: 500, bankId, revision, idem }, Buffer.from('slip-one')));
    assert.equal((await balance(user.id)), 0);
    assert.equal((await s.submitTopup(user, { amount: 500, bankId, revision, idem }, Buffer.from('slip-one'))), topup);
    (await assert.rejects(async () => (await s.submitTopup(other, { amount: 500, bankId, revision, idem }, Buffer.from('slip-one'))), /IDEMPOTENCY_CONFLICT/));
    (await assert.rejects(async () => (await s.submitTopup(user, { amount: 500, bankId, revision, idem: randomUUID() }, Buffer.from('slip-one'))), /DUPLICATE_SLIP/));
    (await assert.rejects(async () => (await s.walletImage(other, 'slip', topup)), /FORBIDDEN/));
    assert.equal((await s.walletImage(admin, 'slip', topup)).toString(), 'slip-one');
    (await assert.rejects(async () => (await s.walletHistory(other, user.id)), /FORBIDDEN/));
    (await assert.rejects(async () => (await s.reviewTopup(user, { id: topup, approve: true, reason: 'Verified bank', reference: 'REF001' })), /FORBIDDEN/));
    (await s.reviewTopup(admin, { id: topup, approve: true, reason: 'Verified bank', reference: 'REF001' }));
    assert.equal((await balance(user.id)), 500);
    assert.equal((await s.walletHistory(user))[0].reason, 'Verified bank');
    (await assert.rejects(async () => (await s.reviewTopup(admin, { id: topup, approve: true, reason: 'Verified bank', reference: 'REF001' })), /ALREADY_REVIEWED/));
    const second = (await s.submitTopup(driver, { amount: 200, bankId, revision, idem: randomUUID() }, Buffer.from('slip-two')));
    (await assert.rejects(async () => (await s.reviewTopup(admin, { id: second, approve: true, reason: 'Verified bank', reference: 'REF001' })), /DUPLICATE_BANK_REFERENCE/));
    assert.equal((await s.walletData(driver)).topups[0].status, 'PENDING');
    (await s.reviewTopup(admin, { id: second, approve: false, reason: 'Amount not received' }));
    assert.equal((await balance(driver.id)), 0);
    (await assert.rejects(async () => (await s.adjustWallet(admin, { userId: driver.id, amount: -100, reason: 'Company commission', idem: randomUUID() })), /NEGATIVE_DISABLED/));
    (await s.savePolicy(admin, { enabled: true, allowNegative: true, cancellationFee: 100, noShowFee: 200 }));
    const adjust = { userId: driver.id, amount: 50, reason: 'Company credit', idem: randomUUID() };
    (await s.adjustWallet(admin, adjust));
    (await s.adjustWallet(admin, adjust));
    assert.equal((await balance(driver.id)), 50);
    const job = { id: randomUUID(), userId: user.id, driverId: driver.id, pickup: 'Pickup', drops: ['Drop'], vehicle: (await vehicles())[0].id, status: 'CANCELLED' as const, fare: { base: 100, distance: 1, distanceFee: 0, helper: 0, stops: 0, total: 100 }, credit: 0, total: 100, note: '', createdAt: new Date().toISOString(), history: [], scheduledAt: null };
    (await saveJob(job));
    (await s.assessFee(admin, { userId: driver.id, jobId: job.id, kind: 'NO_SHOW_FEE', amount: 200, reason: 'Verified missed pickup' }));
    assert.equal((await balance(driver.id)), -150);
    (await assert.rejects(async () => (await s.assessFee(admin, { userId: driver.id, jobId: job.id, kind: 'CANCELLATION_FEE', amount: 100, reason: 'Verified cancellation' })), /FEE_ALREADY_APPLIED/));
    (await assert.rejects(async () => (await db.prepare('UPDATE ledger SET amount=0').run()), /immutable ledger/));
    async function call(path: string, who: string, body?: unknown, origin = 'http://localhost:3000') { const req = new NextRequest('http://localhost:3000/api/wallet/' + path, { method: body ? 'POST' : 'GET', headers: { host: 'localhost:3000', origin, cookie: `jumbo_session=${who}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return (await (body ? POST : GET)(req, { params: Promise.resolve({ path: path.split('/') }) })); }
    assert.equal((await call('data', 'missing')).status, 401);
    assert.equal((await call('policy', 'user', {})).status, 403);
    assert.equal((await call('policy', 'admin', {}, 'http://evil.test')).status, 403);
    assert.equal((await call('slip/' + topup, 'other')).status, 403);
    const own = await call('data', 'user');
    assert.equal(own.headers.get('cache-control'), 'private, no-store');
    assert.equal((await own.json()).topups.length, 1);
    // Negative wallet credit must never increase a balance or the delivery fare.
    (await s.adjustWallet(admin, { userId: user.id, amount: -600, reason: 'Debt regression setup', idem: randomUUID() }));
    const { POST: book } = await import('../src/app/api/v1/[...path]/route');
    const input = { pickup: 'Test pickup', drops: ['Test drop'], locations: [{ lat: 13, lng: 100 }, { lat: 14, lng: 100 }], vehicle: (await vehicles())[0].id, helper: false, useCredit: true, payment: 'cash' as const, note: '', scheduledAt: null };
    process.env.GOOGLE_MAPS_SERVER_KEY = 'test';
    process.env.GOOGLE_MAPS_BROWSER_KEY = 'test';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ routes: [{ distanceMeters: 18500, duration: '1800s', polyline: { encodedPolyline: 'test' } }] });
    let quoteId: string;
    try {
        const { createMapQuote } = await import('../src/lib/server/maps');
        quoteId = (await createMapQuote(user.id, input, (await vehicles())[0])).quoteId;
    }
    finally {
        globalThis.fetch = originalFetch;
    }
    const req = new NextRequest('http://localhost:3000/api/v1/jobs', { method: 'POST', headers: { origin: 'http://localhost:3000', host: 'localhost:3000', cookie: 'jumbo_session=user', 'Content-Type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ ...input, quoteId }) });
    const res = await book(req, { params: Promise.resolve({ path: ['jobs'] }) });
    assert.equal(res.status, 201);
    const created = await res.json();
    assert.equal(created.credit, 0);
    assert.equal(created.total, created.fare.total);
    assert.equal((await balance(user.id)), -100);
});
