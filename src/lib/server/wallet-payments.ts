import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, transaction, audit } from './db';
import { AuthError } from './auth-store';
import type { Session } from '../domain';
import { xenditTestKey, xenditRequest, verifyXendit, xenditQr, verifyXenditToken } from './xendit-test';
(await db.migrate(`CREATE TABLE IF NOT EXISTS wallet_test_payments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,idem TEXT UNIQUE NOT NULL,charge_id TEXT UNIQUE,qr TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,confirmed_at TEXT,reference TEXT);
CREATE TABLE IF NOT EXISTS wallet_test_credits(payment_id TEXT PRIMARY KEY REFERENCES wallet_test_payments(id),user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,at TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS test_credits_no_update BEFORE UPDATE ON wallet_test_credits BEGIN SELECT RAISE(ABORT,'immutable test credits'); END;
CREATE TRIGGER IF NOT EXISTS test_credits_no_delete BEFORE DELETE ON wallet_test_credits BEGIN SELECT RAISE(ABORT,'immutable test credits'); END;`));
export type Payment = {
    id: string;
    user_id: string;
    amount: number;
    mode: string;
    status: string;
    charge_id: string | null;
    qr: string | null;
    created_at: string;
    expires_at: string;
    confirmed_at: string | null;
    reference: string | null;
};
export function paymentMode() { const mode = process.env.WALLET_PAYMENT_MODE; return mode === 'demo' || mode === 'omise_test' || mode === 'xendit_test' || mode === 'beam_live' ? mode : 'disabled'; }
function enabled() { const mode = paymentMode(); if (mode === 'disabled')
    throw new AuthError(503, 'PAYMENTS_DISABLED'); return mode; }
async function row(id: string) { const p = (await db.prepare('SELECT id,user_id,amount,mode,status,charge_id,qr,created_at,expires_at,confirmed_at,reference FROM wallet_test_payments WHERE id=?').get(id)) as Payment | undefined; if (!p)
    throw new AuthError(404, 'NOT_FOUND'); return p; }
function access(user: Session, p: Payment) { if (user.role !== 'admin' && user.id !== p.user_id)
    throw new AuthError(403, 'FORBIDDEN'); }
async function expireDemo() { (await db.prepare("UPDATE wallet_test_payments SET status='EXPIRED' WHERE mode='demo' AND status='PENDING' AND expires_at<?").run(new Date().toISOString())); }
export async function paymentList(user: Session) { (await expireDemo()); return { mode: paymentMode(), testBalance: ((await db.prepare('SELECT COALESCE(SUM(amount),0) AS amount FROM wallet_test_credits WHERE user_id=?').get(user.id)) as {
        amount: number;
    }).amount, payments: (await db.prepare(`SELECT p.id,p.user_id,p.amount,p.mode,p.status,p.charge_id,p.qr,p.created_at,p.expires_at,p.confirmed_at,p.reference,u.name FROM wallet_test_payments p JOIN users u ON u.id=p.user_id ${user.role === 'admin' ? '' : 'WHERE p.user_id=?'} ORDER BY p.created_at DESC LIMIT 100`).all(...(user.role === 'admin' ? [] : [user.id]))) }; }
const chargeSchema = z.object({ id: z.string().regex(/^chrg_/), livemode: z.literal(false), amount: z.number().int(), currency: z.string(), status: z.enum(['pending', 'successful', 'failed', 'expired']), paid: z.boolean(), paid_at: z.string().nullable().optional(), expires_at: z.string(), metadata: z.object({ wallet_payment_id: z.string() }), source: z.object({ type: z.literal('promptpay'), scannable_code: z.object({ image: z.object({ download_uri: z.string().url() }) }).nullable().optional() }) });
async function omise(path: string, body?: URLSearchParams) { const key = process.env.OMISE_SECRET_KEY; if (!key?.startsWith('skey_test_'))
    throw new AuthError(503, 'TEST_KEY_REQUIRED'); const response = await fetch('https://api.omise.co' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'), 'Omise-Version': '2017-11-02', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body, cache: 'no-store', signal: AbortSignal.timeout(15000) }); if (!response.ok)
    throw new AuthError(502, 'PAYMENT_PROVIDER_ERROR'); return chargeSchema.parse(await response.json()); }
function verified(p: Payment, c: z.infer<typeof chargeSchema>) { if (c.amount !== p.amount * 100 || c.currency.toLowerCase() !== 'thb' || c.metadata.wallet_payment_id !== p.id || (p.charge_id && c.id !== p.charge_id))
    throw new AuthError(502, 'PAYMENT_MISMATCH'); const uri = c.source.scannable_code?.image.download_uri; if (uri) {
    const u = new URL(uri);
    if (u.protocol !== 'https:' || u.hostname !== 'api.omise.co')
        throw new AuthError(502, 'INVALID_QR_URL');
} return uri || null; }
async function settle(id: string, status: string, reference: string) { return (await transaction(async () => { const p = (await row(id)); if (p.status === 'SUCCEEDED')
    return p; if (!['PENDING', 'CREATING'].includes(p.status))
    return p; const at = new Date().toISOString(); (await db.prepare('UPDATE wallet_test_payments SET status=?,confirmed_at=?,reference=? WHERE id=?').run(status, at, reference, id)); if (status === 'SUCCEEDED')
    (await db.prepare('INSERT OR IGNORE INTO wallet_test_credits VALUES(?,?,?,?)').run(id, p.user_id, p.amount, at)); (await audit('payment-test', 'WALLET_TEST_PAYMENT_RESULT', { id, status, amount: p.amount, reference })); return (await row(id)); })); }
export async function createPayment(user: Session, input: unknown) {
    const mode = enabled();
    if(mode==='beam_live')throw new AuthError(409,'USE_BEAM_ENDPOINT');
    if (user.role === 'admin')
        throw new AuthError(403, 'FORBIDDEN');
    const data = z.object({ amount: z.number().int().min(20).max(100000), idem: z.string().uuid() }).parse(input);
    const old = (await db.prepare('SELECT id,user_id,amount FROM wallet_test_payments WHERE idem=?').get(data.idem)) as {
        id: string;
        user_id: string;
        amount: number;
    } | undefined;
    if (old) {
        if (old.user_id !== user.id || old.amount !== data.amount)
            throw new AuthError(409, 'IDEMPOTENCY_CONFLICT');
        return (await row(old.id));
    }
    if (mode === 'omise_test' && !process.env.OMISE_SECRET_KEY?.startsWith('skey_test_'))
        throw new AuthError(503, 'TEST_KEY_REQUIRED');
    if (mode === 'xendit_test') xenditTestKey();
    const id = randomUUID(), at = new Date().toISOString(), expires = new Date(Date.now() + 15 * 60000).toISOString();
    (await transaction(async () => { (await db.prepare('INSERT INTO wallet_test_payments(id,user_id,amount,mode,status,idem,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id, user.id, data.amount, mode, mode === 'demo' ? 'PENDING' : 'CREATING', data.idem, at, expires)); (await audit(user.id, 'WALLET_TEST_PAYMENT_CREATED', { id, amount: data.amount, mode })); }));
    if (mode === 'demo')
        return (await row(id));
    if (mode === 'xendit_test') {
        const result = verifyXendit(await row(id), await xenditRequest('', {
            reference_id: id, type: 'PAY', country: 'TH', currency: 'THB', request_amount: data.amount,
            capture_method: 'AUTOMATIC', channel_code: 'QRPROMPTPAY',
            channel_properties: { expires_at: expires, qr_string_type: 'DYNAMIC' },
            description: 'JUMBO GO test wallet top-up',
        }));
        await db.prepare("UPDATE wallet_test_payments SET charge_id=?,qr=?,status='PENDING' WHERE id=? AND status='CREATING'").run(result.payment_request_id, await xenditQr(result), id);
        return refreshPayment(user, id);
    }
    // A timed-out creation is retained for reconciliation rather than silently retried.
    const c = await omise('/charges', new URLSearchParams({ amount: String(data.amount * 100), currency: 'THB', 'source[type]': 'promptpay', 'metadata[wallet_payment_id]': id, expires_at: expires }));
    const qr = verified((await row(id)), c);
    (await db.prepare("UPDATE wallet_test_payments SET charge_id=?,qr=?,expires_at=?,status='PENDING' WHERE id=?").run(c.id, qr, c.expires_at, id));
    return (await refreshPayment(user, id));
}
export async function refreshPayment(user: Session, id: string) { const p = (await row(id)); access(user, p); if (p.mode === 'demo') {
    (await expireDemo());
    return (await row(id));
} if (p.mode === 'xendit_test') {
    if (p.status !== 'PENDING' || !p.charge_id) return p;
    const result = verifyXendit(p, await xenditRequest('/' + encodeURIComponent(p.charge_id)));
    if (['SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELED'].includes(result.status)) return settle(id, result.status === 'CANCELED' ? 'FAILED' : result.status, result.payment_request_id);
    return p;
} if (p.status !== 'PENDING' || !p.charge_id)
    return p; const c = await omise('/charges/' + encodeURIComponent(p.charge_id)); verified(p, c); if (c.status === 'successful' && c.paid)
    return (await settle(id, 'SUCCEEDED', c.id)); if (c.status === 'failed' || c.status === 'expired')
    return (await settle(id, c.status.toUpperCase(), c.id)); return p; }
export async function simulatePayment(user: Session, input: unknown) { if (user.role !== 'admin')
    throw new AuthError(403, 'FORBIDDEN'); if (enabled() !== 'demo')
    throw new AuthError(403, 'SIMULATION_DISABLED'); const p = z.object({ id: z.string().uuid(), status: z.enum(['SUCCEEDED', 'FAILED']) }).parse(input); const payment = (await row(p.id)); if (payment.mode !== 'demo')
    throw new AuthError(403, 'SIMULATION_DISABLED'); (await expireDemo()); (await audit(user.id, 'WALLET_TEST_SIMULATED', { id: p.id, status: p.status })); return (await settle(p.id, p.status, 'DEMO-' + p.id)); }
export async function simulateXendit(user: Session, input: unknown) {
    const { id } = z.object({ id: z.string().uuid() }).parse(input);
    const p = await row(id); access(user, p);
    if (paymentMode() !== 'xendit_test' || p.mode !== 'xendit_test' || p.status !== 'PENDING' || !p.charge_id) throw new AuthError(409, 'SIMULATION_DISABLED');
    await xenditRequest('/' + encodeURIComponent(p.charge_id) + '/simulate', { amount: p.amount });
    // Simulation acceptance is not proof of payment. Refresh/webhook verifies the result.
    return { pending: true };
}
export async function xenditWebhook(input: unknown, token: string | null) {
    verifyXenditToken(token);
    const event = z.object({ event: z.string(), data: z.object({ payment_request_id: z.string().regex(/^pr-[a-zA-Z0-9-]+$/) }) }).parse(input);
    if (!['payment.capture', 'payment.failure', 'payment_request.expiry', 'payment.succeeded'].includes(event.event)) return;
    const p = await db.prepare("SELECT id,user_id FROM wallet_test_payments WHERE mode='xendit_test' AND charge_id=?").get(event.data.payment_request_id) as { id: string; user_id: string } | undefined;
    if (!p) return;
    await refreshPayment({ id: p.user_id, name: '', phone: '', role: 'user' }, p.id);
}
export async function receipt(user: Session, id: string) { const p = (await row(id)); access(user, p); if (p.status !== 'SUCCEEDED')
    throw new AuthError(409, 'PAYMENT_NOT_CONFIRMED'); return { document: 'JUMBO GO TEST PAYMENT CONFIRMATION', testOnly: true, notBankSlip: true, paymentId: p.id, amount: p.amount, currency: 'THB', reference: p.reference, confirmedAt: p.confirmed_at, provider: p.mode, status: p.status }; }
export async function webhook(input: unknown) { const event = z.object({ key: z.string(), data: z.object({ id: z.string().regex(/^chrg_[a-zA-Z0-9]+$/) }) }).parse(input); if (event.key !== 'charge.complete')
    return; const p = (await db.prepare("SELECT id,user_id FROM wallet_test_payments WHERE charge_id=? AND mode='omise_test'").get(event.data.id)) as {
    id: string;
    user_id: string;
} | undefined; if (!p)
    return; await refreshPayment({ id: p.user_id, name: '', phone: '', role: 'user' }, p.id); }
