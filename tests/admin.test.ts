import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { csvCell } from '../src/lib/admin-domain';
process.env.DATABASE_PATH = ':memory:';
process.env.DEMO_MODE = 'false';
process.env.DOCUMENT_ENCRYPTION_KEY = 'a'.repeat(64);
test('back office enforces admin access, persists support updates and detects stale edits', async () => {
    const { db } = await import('../src/lib/server/db');
    const { GET, POST } = await import('../src/app/api/v1/[...path]/route');
    for (const role of ['admin', 'user', 'driver']) {
        (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(role, role, '', role));
        (await db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?)').run(role,`${role}@example.test`,null,role,null,new Date().toISOString()));
        (await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(role + '-token', role, Date.now() + 60000));
    }
    (await db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?)').run('ticket', 'user', 'Please change pickup instructions', 'OPEN', new Date().toISOString()));
    async function request(path: string, role?: string, body?: unknown, origin = 'http://localhost:3000') {
        const method = body === undefined ? 'GET' : 'POST';
        const req = new NextRequest('http://localhost:3000/api/v1/' + path, { method, headers: { host: 'localhost:3000', ...(origin ? { origin } : {}), ...(role ? { cookie: `jumbo_session=${role}-token` } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return (await (method === 'GET' ? GET : POST)(req, { params: Promise.resolve({ path: path.split('/') }) }));
    }
    assert.equal((await request('admin/overview')).status, 401);
    for (const role of ['user', 'driver'])
        assert.equal((await request('admin/overview', role)).status, 403);
    const overview = await request('admin/overview', 'admin');
    assert.equal(overview.status, 200);
    assert.equal(overview.headers.get('cache-control'), 'private, no-store');
    const data = await overview.json();
    assert.equal(data.tickets.length, 1);
    assert.equal('password_hash' in data.users[0], false);
    const update = { status: 'IN_PROGRESS', expectedStatus: 'OPEN', note: 'Called the customer' };
    assert.equal((await request('admin/support/ticket', 'user', update)).status, 403);
    assert.equal((await request('admin/support/ticket', 'admin', update, 'https://attacker.example')).status, 403);
    assert.equal((await request('admin/support/ticket', 'admin', update, '')).status, 403);
    assert.equal((await request('admin/support/ticket', 'admin', { ...update, note: '' })).status, 400);
    assert.equal((await request('admin/support/missing', 'admin', update)).status, 404);
    assert.equal((await request('admin/support/ticket', 'admin', update)).status, 200);
    assert.equal((await db.prepare('SELECT status FROM tickets WHERE id=?').get('ticket'))?.status, 'IN_PROGRESS');
    assert.equal((await db.prepare('SELECT note FROM ticket_updates WHERE ticket_id=?').get('ticket'))?.note, update.note);
    assert.equal((await request('admin/support/ticket', 'admin', { ...update, status: 'RESOLVED' })).status, 409);
    assert.equal((await request('admin/support/ticket', 'admin', { ...update, status: 'RESOLVED', expectedStatus: 'IN_PROGRESS' })).status, 200);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='SUPPORT_UPDATED'").get())?.n, 2);
    assert.equal((await request('admin/pricing', 'user', { id: 'pickup', base: 200, rate: 10 })).status, 403);
    assert.equal((await request('admin/pricing', 'admin', { id: 'pickup', base: -1, rate: 10 })).status, 400);
});
test('CSV quotes strings and neutralizes spreadsheet formulas with leading whitespace', () => {
    assert.equal(csvCell('a,"b"'), '"a,""b"""');
    assert.equal(csvCell(' \t=1+1'), '"\' \t=1+1"');
    assert.equal(csvCell('customer'), '"customer"');
});
