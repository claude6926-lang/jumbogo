import * as oidc from 'openid-client';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db, audit } from './db';
import { AuthError, issueSession, rateLimit } from './auth-store';
import { facebookAuthorizationUrl, facebookClaims } from './facebook';
import { authRole, type AuthRole } from '../auth-domain';
import { oauthOrigin, canonicalOAuthStart } from './oauth-origin';
type Provider = 'google' | 'facebook';
const providers = { google: { issuer: 'https://accounts.google.com', id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET', scope: 'openid email profile' }, facebook: { issuer: 'https://www.facebook.com', id: 'FACEBOOK_APP_ID', secret: 'FACEBOOK_APP_SECRET', scope: 'public_profile,email' } } as const;
function baseUrl() { try {
    return oauthOrigin();
}
catch {
    throw new AuthError(503, 'OAUTH_NOT_CONFIGURED');
} }
export function providerAvailability() { return Object.fromEntries(Object.entries(providers).map(([name, p]) => [name, !!(process.env[p.id] && process.env[p.secret] && process.env.APP_URL)])); }
function providerName(value: string): Provider { if (value !== 'google' && value !== 'facebook')
    throw new AuthError(404, 'NOT_FOUND'); return value; }
async function configuration(provider: Provider) { const p = providers[provider]; const id = process.env[p.id], secret = process.env[p.secret]; if (!id || !secret || !process.env.APP_URL)
    throw new AuthError(503, 'OAUTH_NOT_CONFIGURED'); return oidc.discovery(new URL(p.issuer), id, secret, oidc.ClientSecretPost(secret)); }
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function oauthStart(req: NextRequest, value: string) { const provider = providerName(value); const role = authRole.parse(req.nextUrl.searchParams.get('role') || 'user'); baseUrl(); const canonical = canonicalOAuthStart(req.url, provider, role, req.headers.get('host')); if (canonical) {
    const response = NextResponse.redirect(canonical);
    response.headers.set('Cache-Control', 'no-store');
    return response;
} (await rateLimit('oauth-start', 100, 60000)); const config = provider === 'google' ? await configuration(provider) : null; const id = randomBytes(32).toString('hex'); const state = oidc.randomState(), nonce = oidc.randomNonce(), verifier = oidc.randomPKCECodeVerifier(); (await db.prepare('DELETE FROM oauth_flows WHERE expires<?').run(Date.now())); (await db.prepare('INSERT INTO oauth_flows VALUES(?,?,?,?,?,?,?)').run(id, state, nonce, verifier, provider, role, Date.now() + 10 * 60000)); const url = provider === 'facebook' ? facebookAuthorizationUrl(`${baseUrl()}/api/auth/oauth/facebook/callback`, state) : oidc.buildAuthorizationUrl(config!, { redirect_uri: `${baseUrl()}/api/auth/oauth/${provider}/callback`, scope: providers[provider].scope, state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256' }); const response = NextResponse.redirect(url); response.cookies.set('jumbo_oauth', id, { httpOnly: true, sameSite: 'lax', secure: baseUrl().startsWith('https:'), path: '/', maxAge: 600 }); response.headers.set('Cache-Control', 'no-store'); return response; }
export async function oauthCallback(req: NextRequest, value: string) {
    const provider = providerName(value);
    let role: AuthRole = 'user';
    let stage = 'cookie';
    try {
        const id = req.cookies.get('jumbo_oauth')?.value || '';
        const flow = (await db.prepare('DELETE FROM oauth_flows WHERE id=? RETURNING *').get(id)) as {
            provider: string;
            role: AuthRole;
            state: string;
            nonce: string;
            verifier: string;
            expires: number;
        } | undefined;
        if (!id)
            throw new AuthError(400, 'OAUTH_COOKIE_MISSING');
        stage = 'flow';
        if (!flow)
            throw new AuthError(400, 'OAUTH_FLOW_MISSING');
        role = flow.role;
        if (flow.expires < Date.now())
            throw new AuthError(400, 'OAUTH_FLOW_EXPIRED');
        if (flow.provider !== provider || !safeEqual(flow.state, req.nextUrl.searchParams.get('state') || ''))
            throw new AuthError(400, 'OAUTH_STATE_MISMATCH');
        stage = 'provider';
        const callback = new URL(`/api/auth/oauth/${provider}/callback`, baseUrl());
        callback.search = req.nextUrl.search;
        const claims = provider === 'facebook' ? await facebookClaims(callback) : (await oidc.authorizationCodeGrant(await configuration(provider), callback, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce, idTokenExpected: true })).claims();
        if (!claims?.sub)
            throw new AuthError(400, 'SOCIAL_FAILED');
        stage = 'session';
        return (await completeVerifiedOAuth(req, provider, role, claims));
    }
    catch (error) {
        const rawCode = error instanceof AuthError ? error.message : (error as {
            code?: unknown;
        })?.code;
        const diagnostic = { provider, stage, name: error instanceof Error ? error.name : 'Unknown', code: typeof rawCode === 'string' && /^[A-Z_0-9]{1,80}$/.test(rawCode) ? rawCode : 'UNCLASSIFIED' };
        (await audit('system', 'OAUTH_CALLBACK_FAILED', diagnostic));
        console.error('[oauth-callback]', diagnostic);
        const code = error instanceof AuthError && error.message === 'ACCOUNT_EXISTS' ? 'ACCOUNT_EXISTS' : 'SOCIAL_FAILED';
        const response = NextResponse.redirect(new URL(`/${role}/login?error=${code}`, baseUrl()));
        response.cookies.delete('jumbo_oauth');
        return response;
    }
}
// Called only after the provider response and OAuth state have been verified.
export async function completeVerifiedOAuth(req: NextRequest, provider: Provider, role: AuthRole, claims: {
    sub: string;
    name?: unknown;
    email?: unknown;
    email_verified?: unknown;
}) {
    const existing = (await db.prepare('SELECT user_id FROM identities WHERE provider=? AND subject=? AND role=?').get(provider, claims.sub, role)) as {
        user_id: string;
    } | undefined;
    let response: NextResponse;
    if (existing) {
        response = (await issueSession(req, existing.user_id, NextResponse.redirect(new URL(`/${role}/home`, baseUrl()))));
        (await audit(existing.user_id, 'LOGIN', { method: provider }));
    }
    else {
        const pending = randomBytes(32).toString('hex');
        const email = (provider === 'facebook' || claims.email_verified === true) && typeof claims.email === 'string' ? claims.email : '';
        const name = typeof claims.name === 'string' ? claims.name.slice(0, 100) : '';
        (await db.prepare('DELETE FROM oauth_pending WHERE expires<?').run(Date.now()));
        (await db.prepare('INSERT INTO oauth_pending VALUES(?,?,?,?,?,?,?)').run(pending, provider, claims.sub, role, name, email, Date.now() + 15 * 60000));
        response = NextResponse.redirect(new URL('/auth/complete', baseUrl()));
        response.cookies.set('jumbo_pending', pending, { httpOnly: true, sameSite: 'lax', secure: baseUrl().startsWith('https:'), path: '/', maxAge: 900 });
    }
    response.cookies.delete('jumbo_oauth');
    response.headers.set('Cache-Control', 'no-store');
    return response;
}
