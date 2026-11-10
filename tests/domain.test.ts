import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingSchema, calculateFare, canTransition, initialVehicles, phoneUri, validateSchedule } from '../src/lib/domain';
test('fare contains base, server distance, helpers and additional stops', () => { assert.deepEqual(calculateFare(initialVehicles[0], 18.5, true, 3), { base: 250, distance: 18.5, distanceFee: 222, helper: 150, stops: 200, total: 822 }); });
test('fare rejects invalid distance and stop counts', () => { for (const d of [-1, Infinity, NaN])
    assert.throws(() => calculateFare(initialVehicles[0], d, false, 1)); assert.throws(() => calculateFare(initialVehicles[0], 1, false, 4)); });
test('all five vehicle types use their individual configuration', () => { for (const v of initialVehicles)
    assert.equal(calculateFare(v, 10, false, 1).total, v.base + v.rate * 10); });
test('cannot skip pickup or leave a terminal shipment status', () => { assert.equal(canTransition('SEARCHING', 'ACCEPTED'), true); assert.equal(canTransition('ACCEPTED', 'COMPLETED'), false); assert.equal(canTransition('COMPLETED', 'CANCELLED'), false); assert.equal(canTransition('PICKED_UP', 'CANCELLED'), false); assert.equal(canTransition('ARRIVED_DROPOFF', 'COMPLETED'), true); });
test('schedule enforces two hours to thirty days', () => { const now = Date.UTC(2026, 8, 24); for (const delta of [0, 3600000, 31 * 86400000])
    assert.throws(() => validateSchedule(new Date(now + delta).toISOString(), now)); validateSchedule(new Date(now + 7200000).toISOString(), now); validateSchedule(new Date(now + 30 * 86400000).toISOString(), now); assert.throws(() => validateSchedule('invalid', now)); });
test('telephone link opens a phone handler with sanitized driver number', () => { assert.equal(phoneUri('+66 (81) 234-5678'), 'tel:+66812345678'); assert.equal(phoneUri('0812345678'), 'tel:0812345678'); for (const input of ['javascript:alert(1)', '+66#12345678', '123', '0812345678;ext=123', ''])
    assert.equal(phoneUri(input), null); });
test('booking validates multiple destinations, payment and notes', () => { const valid = { pickup: 'Bangkok', drops: ['Bang Na'], vehicle: 'pickup', helper: false, scheduledAt: null, note: '', payment: 'cash', useCredit: false }; assert.equal(bookingSchema.safeParse(valid).success, true); for (const update of [{ drops: [] }, { drops: ['a', 'b', 'c', 'd'] }, { payment: 'card' }, { pickup: ' ' }, { note: 'x'.repeat(501) }])
    assert.equal(bookingSchema.safeParse({ ...valid, ...update }).success, false); });
