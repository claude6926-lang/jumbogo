import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oauthOrigin, canonicalOAuthStart } from '../src/lib/server/oauth-origin';
test('OAuth requires a public HTTPS origin on Vercel and redirects before setting host-only cookies', () => {
    const oldUrl = process.env.APP_URL, oldVercel = process.env.VERCEL;
    try {
        process.env.VERCEL = '1';
        for (const invalid of ['https://127.0.0.1:3000', 'http://localhost:3000', 'http://app.example.com', 'https://user:secret@app.example.com', 'https://app.example.com/path', 'https://app.example.com?x=1', 'https://app.example.com#x', 'invalid']) {
            assert.throws(() => oauthOrigin(invalid), /OAUTH_NOT_CONFIGURED/);
        }
        process.env.APP_URL = 'https://app.example.com/';
        assert.equal(oauthOrigin(), 'https://app.example.com');
        assert.equal(canonicalOAuthStart('https://app.example.com/api/auth/oauth/google?role=user', 'google', 'user'), null);
        const redirect = canonicalOAuthStart('https://preview.example.com/api/auth/oauth/facebook?role=driver&next=https://attacker.example', 'facebook', 'driver');
        assert.equal(redirect?.href, 'https://app.example.com/api/auth/oauth/facebook?role=driver');
        delete process.env.VERCEL;
        assert.equal(oauthOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
        process.env.APP_URL = 'http://127.0.0.1:3000';
        for (const provider of ['google', 'facebook'] as const) {
            const normalized = `http://localhost:3000/api/auth/oauth/${provider}?role=user`;
            assert.equal(canonicalOAuthStart(normalized, provider, 'user', '127.0.0.1:3000'), null);
            assert.equal(canonicalOAuthStart(normalized, provider, 'user', 'localhost:3000')?.origin, 'http://127.0.0.1:3000');
            assert.equal(canonicalOAuthStart(normalized, provider, 'user', 'attacker.example')?.origin, 'http://127.0.0.1:3000');
        }
        process.env.APP_URL = 'https://app.example.com';
        assert.equal(canonicalOAuthStart('https://app.example.com/api/auth/oauth/google', 'google', 'user', 'preview.example.com')?.origin, 'https://app.example.com');
        assert.equal(canonicalOAuthStart('http://app.example.com/api/auth/oauth/google', 'google', 'user', 'app.example.com')?.protocol, 'https:');
    }
    finally {
        if (oldUrl === undefined)
            delete process.env.APP_URL;
        else
            process.env.APP_URL = oldUrl;
        if (oldVercel === undefined)
            delete process.env.VERCEL;
        else
            process.env.VERCEL = oldVercel;
    }
});
