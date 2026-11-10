import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingSchema, type Job } from '../src/lib/domain';
process.env.DATABASE_PATH = ':memory:';
process.env.DEMO_MODE = 'false';
const contact = { name: 'Receiver', phone: '0812345678' };
const input = { pickup: 'Pickup', drops: ['Stop 1', 'Stop 2', 'Destination'], contacts: { pickup: contact, drops: [contact, contact, contact] }, vehicle: 'pickup', helper: false, scheduledAt: null, note: '', payment: 'cash', useCredit: false };
test('contacts validate names, dialable phone numbers and exact stop alignment', () => {
    assert.equal(bookingSchema.safeParse(input).success, true);
    assert.equal(bookingSchema.safeParse({ ...input, contacts: { pickup: contact, drops: [contact] } }).success, false);
    for (const phone of ['123', 'javascript:alert(1)', '0812345678;ext=1'])
        assert.equal(bookingSchema.safeParse({ ...input, contacts: { ...input.contacts, pickup: { ...contact, phone } } }).success, false);
    assert.equal(bookingSchema.safeParse({ ...input, contacts: { ...input.contacts, pickup: { name: ' ', phone: contact.phone } } }).success, false);
});
test('contacts persist and are returned to owners/admin/assigned drivers only', async () => {
    const { db, saveJob, getJobs } = await import('../src/lib/server/db');
    for (const id of ['owner', 'driver', 'other'])
        (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(id, id, '', id === 'owner' ? 'user' : 'driver'));
    const job = { ...input, id: 'job', userId: 'owner', driverId: null, status: 'SEARCHING', total: 100, credit: 0, fare: { total: 100 }, createdAt: new Date().toISOString(), history: [] } as unknown as Job;
    (await saveJob(job));
    assert.deepEqual((await getJobs('owner', 'user'))[0].contacts, input.contacts);
    assert.deepEqual((await getJobs('admin', 'admin'))[0].contacts, input.contacts);
    assert.equal((await getJobs('driver', 'driver'))[0].contacts, undefined);
    job.driverId = 'driver';
    job.status = 'ACCEPTED';
    (await saveJob(job));
    assert.deepEqual((await getJobs('driver', 'driver'))[0].contacts, input.contacts);
    assert.equal((await getJobs('other', 'driver')).length, 0);
});
