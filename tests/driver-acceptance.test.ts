import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { Job } from '../src/lib/domain';
process.env.DATABASE_PATH = ':memory:';
process.env.DEMO_MODE = 'false';
process.env.DOCUMENT_ENCRYPTION_KEY = 'a'.repeat(64);
test('API serializes competing claims and enforces reservations and single execution', async () => {
    const { db, saveJob, getJob } = await import('../src/lib/server/db');
    const { POST } = await import('../src/app/api/v1/[...path]/route');
    for (const id of ['customer', 'one', 'two', 'unapproved']) {
        (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(id, id, '', id === 'customer' ? 'user' : 'driver'));
        (await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(id + '-token', id, Date.now() + 60000));
        if (id === 'one' || id === 'two')
            (await db.prepare('INSERT INTO driver_applications VALUES(?,?,NULL,NULL,NULL,?)').run(id, 'APPROVED', new Date().toISOString()));
    }
    const { updateWork, saveProof } = await import('../src/lib/server/driver-store');
    for (const id of ['one', 'two'])
        (await updateWork({ id, name: id, phone: '', role: 'driver' }, { online: true, vehicle: 'pickup' }));
    const future = new Date(Date.now() + 86400000).toISOString();
    const seed = async (id: string, scheduledAt: string | null = null) => (await saveJob({ id, userId: 'customer', driverId: null, status: 'SEARCHING', scheduledAt, pickup: 'A', drops: ['B'], vehicle: 'pickup', fare: { base: 100, distance: 1, distanceFee: 0, helper: 0, stops: 0, total: 100 }, credit: 0, total: 100, note: '', createdAt: new Date().toISOString(), history: [] } as Job));
    const change = async (id: string, driver: string, status = 'ACCEPTED') => (await POST(new NextRequest('http://localhost:3000/api/v1/jobs/' + id + '/status', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', cookie: `jumbo_session=${driver}-token`, 'content-type': 'application/json' }, body: JSON.stringify({ status }) }), { params: Promise.resolve({ path: ['jobs', id, 'status'] }) }));
    (await seed('race'));
    assert.equal((await change('race', 'unapproved')).status, 403);
    const raced = await Promise.all([change('race', 'one'), change('race', 'two')]);
    assert.deepEqual(raced.map(r => r.status).sort(), [200, 409]);
    const owner = (await getJob('race'))!.driverId!;
    assert.equal((await change('race', owner)).status, 409);
    assert.equal((await getJob('race'))!.history.length, 1);
    (await seed('immediate'));
    assert.equal((await change('immediate', owner)).status, 409);
    (await seed('reserved', future));
    assert.equal((await change('reserved', owner)).status, 200);
    (await seed('conflicting', future));
    assert.equal((await change('conflicting', owner)).status, 409);
    assert.equal((await getJob('conflicting'))!.driverId, null);
    assert.equal((await change('reserved', owner, 'ARRIVING')).status, 409);
    assert.equal((await change('race', owner, 'ARRIVING')).status, 200);
    assert.equal((await change('reserved', owner, 'ARRIVING')).status, 409);
    for (const status of ['ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_DROPOFF'])
        assert.equal((await change('race', owner, status)).status, 200);
    assert.equal((await change('race', owner, 'COMPLETED')).status, 409);
    (await saveProof({ id: owner, name: owner, phone: '', role: 'driver' }, 'race', { recipient: 'Receiver', note: '' }, Buffer.from('fixture')));
    assert.equal((await change('race', owner, 'COMPLETED')).status, 200);
    assert.equal((await change('reserved', owner, 'ARRIVING')).status, 200);
    (await seed('later', new Date(Date.now() + 172800000).toISOString()));
    const duplicate = await Promise.all([change('later', owner), change('later', owner)]);
    assert.deepEqual(duplicate.map(r => r.status).sort(), [200, 409]);
    assert.equal((await getJob('later'))!.history.length, 1);
});
