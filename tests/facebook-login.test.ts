import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
process.env.DATABASE_PATH = ':memory:';
process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.FACEBOOK_APP_ID = 'test-app';
process.env.FACEBOOK_APP_SECRET = 'test-secret';
test('Facebook code exchange validates app, expiry and identity, handles absent email, and keeps secrets out of the authorization URL', async () => {
    const { facebookAuthorizationUrl, facebookClaims } = await import('../src/lib/server/facebook');
    const url = facebookAuthorizationUrl('http://127.0.0.1:3000/api/auth/oauth/facebook/callback', 'test-state');
    assert.equal(url.hostname, 'www.facebook.com');
    assert.equal(url.searchParams.get('state'), 'test-state');
    assert(!url.href.includes('test-secret'));
    const fetchOriginal = globalThis.fetch;
    let wrongApp = false, wrongUser = false, expired = false, calls = 0;
    globalThis.fetch = async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert(!url.href.includes('test-secret'));
        if (url.pathname.endsWith('/oauth/access_token')) {
            assert.equal(init?.method, 'POST');
            assert(String(init?.body).includes('client_secret=test-secret'));
            return Response.json({ access_token: 'test-token' });
        }
        if (url.pathname.endsWith('/debug_token'))
            return Response.json({ data: { is_valid: true, app_id: wrongApp ? 'other-app' : 'test-app', user_id: 'facebook-user', type: 'USER', expires_at: expired ? 1 : Math.floor(Date.now() / 1000) + 3600 } });
        assert(url.searchParams.has('appsecret_proof'));
        return Response.json({ id: wrongUser ? 'other-user' : 'facebook-user', name: 'Test Customer' });
    };
    const callback = new URL('http://127.0.0.1:3000/api/auth/oauth/facebook/callback?code=code&state=test-state');
    try {
        assert.deepEqual(await facebookClaims(callback), { sub: 'facebook-user', name: 'Test Customer', email: '', email_verified: false });
        assert.equal(calls, 3);
        wrongApp = true;
        await assert.rejects(facebookClaims(callback), /SOCIAL_FAILED/);
        wrongApp = false;
        expired = true;
        await assert.rejects(facebookClaims(callback), /SOCIAL_FAILED/);
        expired = false;
        wrongUser = true;
        await assert.rejects(facebookClaims(callback), /SOCIAL_FAILED/);
        wrongUser = false;
        const { db } = await import('../src/lib/server/db');
        const { oauthCallback, providerAvailability } = await import('../src/lib/server/oauth');
        assert.equal(providerAvailability().facebook, true);
        assert(!('line' in providerAvailability()));
        const makeFlow = async (id: string) => (await db.prepare('INSERT INTO oauth_flows VALUES(?,?,?,?,?,?,?)').run(id, 'valid-state', 'unused', 'unused', 'facebook', 'user', Date.now() + 60000));
        (await makeFlow('invalid'));
        const before = calls;
        const invalid = await oauthCallback(new NextRequest('http://127.0.0.1:3000/api/auth/oauth/facebook/callback?code=code&state=wrong', { headers: { cookie: 'jumbo_oauth=invalid' } }), 'facebook');
        assert(invalid.headers.get('location')?.includes('SOCIAL_FAILED'));
        assert.equal(calls, before);
        (await makeFlow('valid'));
        const req = new NextRequest('http://127.0.0.1:3000/api/auth/oauth/facebook/callback?code=code&state=valid-state', { headers: { cookie: 'jumbo_oauth=valid' } });
        const success = await oauthCallback(req, 'facebook');
        assert(success.headers.get('location')?.endsWith('/auth/complete'));
        assert(success.cookies.has('jumbo_pending'));
        assert.equal((await db.prepare('SELECT provider FROM oauth_pending').get())?.provider, 'facebook');
        const replay = await oauthCallback(req, 'facebook');
        assert(replay.headers.get('location')?.includes('SOCIAL_FAILED'));
    }
    finally {
        globalThis.fetch = fetchOriginal;
    }
});
