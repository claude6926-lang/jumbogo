import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema } from '../src/lib/auth-domain';
process.env.DATABASE_PATH = ':memory:';
process.env.DOCUMENT_ENCRYPTION_KEY = 'a'.repeat(64);
const details = { customerType: 'business' as const, companyName: 'QA Business', address: '123 Sample Street', subdistrict: 'Sample Subdistrict', district: 'Sample District', province: 'Bangkok', postalCode: '10400' };
const input = { name: 'QA Customer', email: 'customer@example.com', phone: '0812345678', role: 'user' as const, password: 'Password123', confirmPassword: 'Password123', consent: true as const, customerDetails: details };
test('customer registration rejects missing address, invalid postal code, blank business name and mismatched passwords', () => {
    assert(registerSchema.safeParse(input).success);
    for (const invalid of [{ ...input, customerDetails: undefined }, { ...input, confirmPassword: 'Different123' }, { ...input, customerDetails: { ...details, companyName: '' } }, { ...input, customerDetails: { ...details, postalCode: '123' } }])
        assert.equal(registerSchema.safeParse(invalid).success, false);
    assert(registerSchema.safeParse({ ...input, role: 'driver', customerDetails: undefined, confirmPassword: undefined }).success);
    assert.equal(registerSchema.parse({ ...input, customerDetails: { ...details, customerType: 'individual' } }).customerDetails?.companyName, '');
});
test('registration contact details persist encrypted and failed persistence rolls back the account', async () => {
    const { db } = await import('../src/lib/server/db');
    const { createAccount } = await import('../src/lib/server/auth-store');
    const { saveCustomerDetails, getCustomerDetails } = await import('../src/lib/server/customer-details');
    const id = (await createAccount(input, 'test-hash', undefined, async (id) => (await saveCustomerDetails(id, details))));
    assert.deepEqual((await getCustomerDetails(id)), details);
    assert.equal((await getCustomerDetails('missing')), null);
    const row = (await db.prepare('SELECT encrypted FROM customer_details WHERE user_id=?').get(id)) as {
        encrypted: Uint8Array;
    };
    assert.equal(Buffer.from(row.encrypted).includes(Buffer.from(details.address)), false);
    (await assert.rejects(async () => (await createAccount({ ...input, email: 'rollback@example.com', phone: '0822345678' }, 'test-hash', undefined, () => { throw new Error('Storage unavailable'); }))));
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE email='rollback@example.com'").get())?.n, 0);
});
