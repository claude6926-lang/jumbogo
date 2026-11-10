import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceError, startError } from '../src/lib/driver-jobs';
import type { Job } from '../src/lib/domain';
const now = Date.parse('2026-09-28T01:00:00Z');
const future = '2026-09-29T01:00:00Z';
const job = (overrides: Partial<Job> = {}) => ({ id: 'new', driverId: null, status: 'SEARCHING', scheduledAt: null, ...overrides } as Job);
const active = job({ id: 'active', driverId: 'driver', status: 'IN_TRANSIT' });
test('scheduled work can be reserved during an immediate delivery, but immediate work cannot', () => {
    assert.equal(acceptanceError(job({ scheduledAt: future }), [active], 'driver', now), null);
    assert.equal(acceptanceError(job(), [active], 'driver', now), 'DRIVER_BUSY');
    assert.equal(acceptanceError(job(), [job({ ...active, status: 'COMPLETED' })], 'driver', now), null);
});
test('reservations reject duplicate times even across time zone representations', () => {
    const reserved = job({ id: 'reserved', driverId: 'driver', status: 'ACCEPTED', scheduledAt: future });
    assert.equal(acceptanceError(job({ scheduledAt: '2026-09-29T08:00:00+07:00' }), [reserved], 'driver', now), 'SCHEDULE_CONFLICT');
    assert.equal(acceptanceError(job({ scheduledAt: '2026-09-29T03:00:00Z' }), [reserved], 'driver', now), null);
    assert.equal(acceptanceError(job(), [reserved], 'driver', now), null);
});
test('expired schedules and already claimed or closed jobs cannot be accepted', () => {
    for (const date of ['invalid', '2026-09-28T01:00:00Z'])
        assert.equal(acceptanceError(job({ scheduledAt: date }), [], 'driver', now), 'SCHEDULE_EXPIRED');
    assert.equal(acceptanceError(job({ driverId: 'other' }), [], 'driver', now), 'ALREADY_ASSIGNED');
    assert.equal(acceptanceError(job({ status: 'CANCELLED' }), [], 'driver', now), 'INVALID_TRANSITION');
});
test('only one delivery can start, future reservations and other drivers do not block', () => {
    const reserved = job({ driverId: 'driver', status: 'ACCEPTED', scheduledAt: future });
    assert.equal(startError(reserved, [active]), 'DRIVER_BUSY');
    assert.equal(startError(reserved, [job({ ...active, status: 'ACCEPTED' })]), 'DRIVER_BUSY');
    assert.equal(startError(reserved, [job({ ...active, status: 'ACCEPTED', scheduledAt: future })]), null);
    assert.equal(startError(reserved, [job({ ...active, driverId: 'other' })]), null);
});
