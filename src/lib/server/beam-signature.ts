import { createHmac, timingSafeEqual } from 'node:crypto';

// Beam signs the original request bytes with a base64-encoded HMAC key.
// Never parse/re-serialize JSON before calling this function.
export function verifyBeamSignature(body: Uint8Array, signature: string | null, key: string): boolean {
    const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    if (!signature || !key || !base64.test(signature) || !base64.test(key)) return false;
    const secret = Buffer.from(key, 'base64');
    if (secret.length < 32) return false;
    const received = Buffer.from(signature, 'base64');
    const expected = createHmac('sha256', secret).update(body).digest();
    return received.length === expected.length && timingSafeEqual(received, expected);
}
