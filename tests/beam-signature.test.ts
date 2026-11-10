import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyBeamSignature } from '../src/lib/server/beam-signature';

test('Beam webhook rejects tampering, wrong secrets and invalid signatures', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const body = Buffer.from('{"amount":10000,"status":"SUCCEEDED"}');
    const signature = createHmac('sha256', Buffer.from(key, 'base64')).update(body).digest('base64');
    assert.equal(verifyBeamSignature(body, signature, key), true);
    assert.equal(verifyBeamSignature(Buffer.from('{"amount":100000,"status":"SUCCEEDED"}'), signature, key), false);
    assert.equal(verifyBeamSignature(Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2)), signature, key), false);
    assert.equal(verifyBeamSignature(body, signature, Buffer.alloc(32, 8).toString('base64')), false);
    for (const invalid of [null, '', 'invalid', signature + '!']) {
        assert.equal(verifyBeamSignature(body, invalid, key), false);
    }
    assert.equal(verifyBeamSignature(body, signature, ''), false);
});
