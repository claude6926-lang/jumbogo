import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { decodePolyline, navigationUrl } from '../src/lib/maps';
process.env.DATABASE_PATH = ':memory:';
process.env.DOCUMENT_ENCRYPTION_KEY = 'd'.repeat(64);
process.env.DEMO_MODE = 'true';
test('map routes calculate authoritative fares, bind quotes and enforce route access without fake fallback', async () => {
    const { db } = await import('../src/lib/server/db');
    const api = await import('../src/app/api/v1/[...path]/route');
    const maps = await import('../src/app/api/maps/[...path]/route');
    for (const id of ['user', 'other']) {
        (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(id, id, '', 'user'));
        (await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(id, id, Date.now() + 3600000));
    }
    const call = async (route: string, body?: unknown, user = 'user', mapsApi = false) => { const req = new NextRequest('http://localhost:3000/api/' + (mapsApi ? 'maps/' : 'v1/') + route, { method: body === undefined ? 'GET' : 'POST', headers: { origin: 'http://localhost:3000', host: 'localhost:3000', cookie: 'jumbo_session=' + user, 'Content-Type': 'application/json', 'idempotency-key': idem }, body: body === undefined ? undefined : JSON.stringify(body) }); return (await (mapsApi ? (body === undefined ? maps.GET : maps.POST) : (body === undefined ? api.GET : api.POST))(req, { params: Promise.resolve({ path: route.split('/') }) })); };
    let idem = randomUUID();
    const input = { pickup: 'Bangkok origin', drops: ['Bangkok stop', 'Bangkok destination'], locations: [{ lat: 13.7, lng: 100.5 }, { lat: 13.71, lng: 100.51 }, { lat: 13.72, lng: 100.52 }], vehicle: 'pickup', helper: true, note: '', payment: 'cash', useCredit: false, scheduledAt: null };
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.GOOGLE_MAPS_BROWSER_KEY;
    assert.equal((await call('quote', input)).status, 503);
    assert.equal((await call('config', undefined, 'user', true)).status, 200);
    process.env.GOOGLE_MAPS_SERVER_KEY = 'server-test-secret';
    process.env.GOOGLE_MAPS_BROWSER_KEY = 'browser-test';
    const original = globalThis.fetch;
    const requests: Record<string, unknown>[] = [];
    globalThis.fetch = async (url, init) => {
        assert.match(String(url), /^https:\/\/(routes|maps).googleapis.com\//);
        if (String(url).includes('geocode'))
            return Response.json({ status: 'OK', results: [{ formatted_address: 'Bangkok test', place_id: 'test-place', geometry: { location: { lat: 13.7, lng: 100.5 } } }] });
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({ routes: [{ distanceMeters: 12340, duration: '900s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } }] });
    };
    try {
        const search = await call('search', { address: 'Bangkok' }, 'user', true);
        assert.equal((await search.json()).places[0].placeId, 'test-place');
        assert.equal((await call('quote', { ...input, locations: undefined })).status, 400);
        const q = await (await call('quote', input)).json();
        assert.equal(q.fare.distance, 12.3);
        assert.equal(q.fare.total, 648);
        assert.equal(q.simulated, false);
        assert.equal((requests[0].intermediates as unknown[]).length, 1);
        assert.equal(JSON.stringify(q).includes('server-test-secret'), false);
        assert.equal((await call('jobs', { ...input, quoteId: q.quoteId, vehicle: 'six' })).status, 409);
        assert.equal((await call('jobs', { ...input, quoteId: q.quoteId, extraHelpers:1 })).status,409);
        assert.equal((await call('jobs', { ...input, quoteId: q.quoteId, pickupStairs:1 })).status,409);
        assert.equal((await call('jobs', { ...input, quoteId: q.quoteId }, 'other')).status, 403);
        const response = await call('jobs', { ...input, quoteId: q.quoteId, fare: { total: 1 } });
        assert.equal(response.status, 201);
        const job = await response.json();
        assert.equal(job.fare.total, 648);
        assert.deepEqual(job.locations, input.locations);
        const replay = await (await call('jobs', { ...input, quoteId: q.quoteId })).json();
        assert.equal(replay.id, job.id);
        assert.equal((await call('job/' + job.id, undefined, 'other', true)).status, 403);
        assert.equal((await call('job/' + job.id, undefined, 'user', true)).status, 200);
        assert.equal(requests.length,1,'job map reuses the booking route');
        const {computeRoute}=await import('../src/lib/server/maps');
        const relabeled=await computeRoute(input.locations.map(p=>({...p,address:'New label'})));
        assert.equal(relabeled.points[0].address,'New label');
        assert.equal(requests.length,1,'address labels do not trigger another route request');
        await computeRoute([...input.locations].reverse().map(p=>({...p,address:'Reversed stop'})));
        assert.equal(requests.length,2,'waypoint order is part of the cache key');
        assert.equal((await call('autocomplete',{input:'ab'},'user',true)).status,400);
        assert.equal((await call('autocomplete',{input:'Bangkok'},'user',true)).status,200);
        for(let i=0;i<30;i++)assert.equal((await call('autocomplete',{input:'Bangkok'},'other',true)).status,200);
        assert.equal((await call('autocomplete',{input:'Bangkok'},'other',true)).status,429,'autocomplete has a per-user request limit');
        const config = await (await call('config', undefined, 'user', true)).json();
        assert.equal(config.browserKey, 'browser-test');
        assert.equal(JSON.stringify(config).includes('server-test-secret'), false);
        const now = Date.now;
        Date.now = () => now() + 601000;
        try {
            idem = randomUUID();
            assert.equal((await call('jobs', { ...input, quoteId: q.quoteId })).status, 409);
            globalThis.fetch = async () => { throw new Error('private upstream error'); };
            const failed = await call('quote', input);
            assert.equal(failed.status,502,'expired route cache calls the upstream again');
            assert.equal((await failed.json()).error,'MAP_PROVIDER_UNAVAILABLE');
            globalThis.fetch=async()=>Response.json({error:{message:'private upstream message',details:[{reason:'API_KEY_IP_ADDRESS_BLOCKED',metadata:{key:'never expose'}}]}},{status:403});
            const blocked=await call('quote',input);
            assert.equal(blocked.status,502);
            assert.deepEqual(await blocked.json(),{error:'MAP_API_KEY_IP_ADDRESS_BLOCKED'});
        }
        finally {
            Date.now = now;
        }
    }
    finally {
        globalThis.fetch = original;
        delete process.env.GOOGLE_MAPS_SERVER_KEY;
        delete process.env.GOOGLE_MAPS_BROWSER_KEY;
    }
});
test('navigation uses confirmed coordinates and polylines reject invalid data', () => {
    const url = new URL(navigationUrl('untrusted address', { lat: 13.7, lng: 100.5 }));
    assert.equal(url.searchParams.get('destination'), '13.7,100.5');
    assert.equal(url.searchParams.get('dir_action'), 'navigate');
    assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }]);
    assert.throws(() => decodePolyline('~~~~'));
});
