import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import QRCode from 'qrcode';
import { AuthError } from './auth-store';

export function xenditTestKey() {
    const key = process.env.XENDIT_SECRET_KEY;
    if (!key?.startsWith('xnd_development_')) throw new AuthError(503, 'TEST_KEY_REQUIRED');
    return key;
}
export function verifyXenditToken(token: string | null) {
    const expected = process.env.XENDIT_WEBHOOK_TOKEN;
    if (!expected) throw new AuthError(503, 'WEBHOOK_NOT_CONFIGURED');
    const a = Buffer.from(token || ''), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AuthError(401, 'INVALID_CALLBACK_TOKEN');
}
const schema = z.object({
    payment_request_id: z.string().regex(/^pr-[a-zA-Z0-9-]+$/), reference_id: z.string(),
    request_amount: z.number(), currency: z.literal('THB'), country: z.literal('TH'),
    type: z.literal('PAY'), capture_method: z.literal('AUTOMATIC'), channel_code: z.literal('QRPROMPTPAY'),
    status: z.enum(['REQUIRES_ACTION', 'ACCEPTING_PAYMENTS', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELED']),
    actions: z.array(z.object({ type: z.string(), descriptor: z.string(), value: z.string().max(10000) })).optional(),
});
export async function xenditRequest(path: string, body?: unknown) {
    const response = await fetch('https://api.xendit.co/v3/payment_requests' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(xenditTestKey() + ':').toString('base64'), 'api-version': '2024-11-11', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new AuthError(502, 'PAYMENT_PROVIDER_ERROR');
    return response.json();
}
export function verifyXendit(payment: { id: string; amount: number; charge_id: string | null }, input: unknown) {
    const result = schema.parse(input);
    if (result.reference_id !== payment.id || result.request_amount !== payment.amount || (payment.charge_id && result.payment_request_id !== payment.charge_id)) throw new AuthError(502, 'PAYMENT_MISMATCH');
    return result;
}
export async function xenditQr(result: z.infer<typeof schema>) {
    const value = result.actions?.find(a => a.type === 'PRESENT_TO_CUSTOMER' && a.descriptor === 'QR_STRING')?.value;
    return value ? QRCode.toDataURL(value, { width: 320, margin: 4, errorCorrectionLevel: 'M' }) : null;
}
