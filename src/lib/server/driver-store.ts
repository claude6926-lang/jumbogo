import { randomUUID } from 'node:crypto';
import {queueTransportReceipt,deliverPaymentEmail} from './payment-email';
import {isTestJob} from '../test-accounts';
import { z } from 'zod';
import { db, transaction, audit, getJob, getJobs } from './db';
import { AuthError, driverApproved, encrypt, decrypt, application } from './auth-store';
import type { Session } from '../domain';
(await db.migrate(`
 CREATE TABLE IF NOT EXISTS driver_work(user_id TEXT PRIMARY KEY REFERENCES users(id),online INTEGER NOT NULL,vehicle TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS delivery_proofs(job_id TEXT PRIMARY KEY REFERENCES jobs(id),recipient TEXT NOT NULL,note TEXT NOT NULL,image BLOB NOT NULL,at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS delivery_locations(job_id TEXT PRIMARY KEY REFERENCES jobs(id),lat REAL NOT NULL,lng REAL NOT NULL,accuracy REAL NOT NULL,at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS driver_pay_policy(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL,commission INTEGER NOT NULL,minimum INTEGER NOT NULL);
 INSERT OR IGNORE INTO driver_pay_policy VALUES(1,0,0,100);
 CREATE TABLE IF NOT EXISTS driver_settlements(job_id TEXT PRIMARY KEY REFERENCES jobs(id),driver_id TEXT NOT NULL REFERENCES users(id),gross INTEGER NOT NULL,commission INTEGER NOT NULL,cash INTEGER NOT NULL,net INTEGER NOT NULL,reference TEXT UNIQUE NOT NULL,at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS driver_withdrawals(id TEXT PRIMARY KEY,driver_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,bank BLOB NOT NULL,status TEXT NOT NULL,reference TEXT UNIQUE,note TEXT NOT NULL,at TEXT NOT NULL,idem TEXT UNIQUE NOT NULL);
 CREATE TRIGGER IF NOT EXISTS settlement_no_update BEFORE UPDATE ON driver_settlements BEGIN SELECT RAISE(ABORT,'immutable settlement'); END;
 CREATE TRIGGER IF NOT EXISTS settlement_no_delete BEFORE DELETE ON driver_settlements BEGIN SELECT RAISE(ABORT,'immutable settlement'); END;
`));
const fail = (code: string, status = 409): never => { throw new AuthError(status, code); };
const at = () => new Date().toISOString();
export async function approvedDriver(user: Session) { if (user.role !== 'driver')
    fail('FORBIDDEN', 403); if (!(await driverApproved(user)))
    fail('DRIVER_NOT_APPROVED', 403); }
function admin(user: Session) { if (user.role !== 'admin')
    fail('FORBIDDEN', 403); }
export async function workState(id: string) { return (await db.prepare('SELECT online,vehicle FROM driver_work WHERE user_id=?').get(id)) as {
    online: number;
    vehicle: string;
} | undefined; }
export async function acceptWorkError(id: string, vehicle: string) { const state = (await workState(id)); return !state?.online ? 'DRIVER_OFFLINE' : state.vehicle !== vehicle ? 'VEHICLE_MISMATCH' : null; }
export async function updateWork(user: Session, input: unknown) { (await approvedDriver(user)); const p = z.object({ online: z.boolean(), vehicle: z.enum(['pickup', 'box', 'cage', 'jumbo', 'six']) }).parse(input); (await transaction(async () => { const approvedVehicle = (await application(user.id))?.personal?.vehicleType; if (approvedVehicle && p.vehicle !== approvedVehicle)
    fail('VEHICLE_MISMATCH'); (await db.prepare('INSERT INTO driver_work VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET online=excluded.online,vehicle=excluded.vehicle,updated_at=excluded.updated_at').run(user.id, Number(p.online), p.vehicle, at())); (await audit(user.id, 'DRIVER_AVAILABILITY', p)); })); }
async function accessible(user: Session, id: string) { const job = (await getJob(id)) || fail('NOT_FOUND', 404); if (user.role !== 'admin' && job.userId !== user.id && job.driverId !== user.id)
    fail('FORBIDDEN', 403); return job; }
async function assigned(user: Session, id: string) { (await approvedDriver(user)); const job = (await accessible(user, id)); if (job.driverId !== user.id)
    fail('FORBIDDEN', 403); return job; }
export async function hasProof(id: string) { return !!(await db.prepare('SELECT job_id FROM delivery_proofs WHERE job_id=?').get(id)); }
export async function saveProof(user: Session, id: string, input: unknown, image: Buffer) { const p = z.object({ recipient: z.string().trim().min(2).max(100), note: z.string().trim().max(500) }).parse(input); (await transaction(async () => { const job = (await assigned(user, id)); if (job.status !== 'ARRIVED_DROPOFF')
    fail('INVALID_TRANSITION'); if ((await hasProof(id)))
    fail('PROOF_EXISTS'); (await db.prepare('INSERT INTO delivery_proofs VALUES(?,?,?,?,?)').run(id, p.recipient, p.note, encrypt(image), at())); (await audit(user.id, 'DELIVERY_PROOF_SAVED', { jobId: id })); })); }
export async function proofImage(user: Session, id: string) { (await accessible(user, id)); const row = (await db.prepare('SELECT image FROM delivery_proofs WHERE job_id=?').get(id)) as {
    image: Uint8Array;
} | undefined; if (!row)
    fail('NOT_FOUND', 404); (await audit(user.id, 'DELIVERY_PROOF_VIEWED', { jobId: id })); return decrypt(row!.image); }
export async function jobOperations(user: Session, id: string) { const job = (await accessible(user, id)); return { status:job.status, proof: (await db.prepare('SELECT recipient,note,at FROM delivery_proofs WHERE job_id=?').get(id)) || null, location: ['COMPLETED', 'CANCELLED', 'FAILED'].includes(job.status) ? null : (await db.prepare('SELECT lat,lng,accuracy,at FROM delivery_locations WHERE job_id=?').get(id)) || null, customer: job.driverId === user.id ? (await db.prepare('SELECT name,phone FROM users WHERE id=?').get(job.userId)) : null }; }
export async function updateLocation(user: Session, id: string, input: unknown) { const p = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100000), capturedAt: z.number().finite().optional(),consent:z.literal(true) }).parse(input); if (p.capturedAt !== undefined && (p.capturedAt > Date.now() + 30000 || p.capturedAt < Date.now() - 60000))
    fail('STALE_LOCATION', 400); (await transaction(async () => { const job = (await assigned(user, id)); if (!['ARRIVING', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_DROPOFF'].includes(job.status))
    fail('INVALID_TRANSITION'); const first=!(await db.prepare('SELECT job_id FROM delivery_locations WHERE job_id=?').get(id)); if(first)await audit(user.id,'LOCATION_SHARING_CONSENT',{jobId:id,scope:'active-job-only',version:1}); (await db.prepare('INSERT INTO delivery_locations VALUES(?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,at=excluded.at WHERE excluded.at>delivery_locations.at').run(id, p.lat, p.lng, p.accuracy, p.capturedAt !== undefined ? new Date(p.capturedAt).toISOString() : at())); })); }
export async function payPolicy() { return (await db.prepare('SELECT enabled,commission,minimum FROM driver_pay_policy WHERE id=1').get()) as {
    enabled: number;
    commission: number;
    minimum: number;
}; }
export async function updatePayPolicy(user: Session, input: unknown) { admin(user); const p = z.object({ enabled: z.boolean(), commission: z.number().int().min(0).max(100), minimum: z.number().int().min(1).max(100000) }).parse(input); (await transaction(async () => { (await db.prepare('UPDATE driver_pay_policy SET enabled=?,commission=?,minimum=? WHERE id=1').run(Number(p.enabled), p.commission, p.minimum)); (await audit(user.id, 'DRIVER_PAY_POLICY', p)); })); }
export async function earnings(id: string) { const settled = Number((await db.prepare('SELECT COALESCE(SUM(net),0) n FROM driver_settlements WHERE driver_id=?').get(id))!.n); const reserved = Number((await db.prepare("SELECT COALESCE(SUM(amount),0) n FROM driver_withdrawals WHERE driver_id=? AND status IN ('PENDING','PAID')").get(id))!.n); return { settled, available: Math.max(0, settled - reserved), debt: Math.max(0, reserved - settled) }; }
export async function settleJob(user: Session, input: unknown) { admin(user); const p = z.object({ jobId: z.string().min(1), cash: z.number().int().min(0), reference: z.string().trim().min(5).max(100) }).parse(input); (await transaction(async () => { const policy = (await payPolicy()); if (!policy.enabled)
    fail('PAY_POLICY_DISABLED');if(isTestJob(p.jobId))fail('TEST_JOB_RESTRICTED'); const job = (await getJob(p.jobId)) || fail('NOT_FOUND', 404); if (job.status !== 'COMPLETED' || !job.driverId)
    fail('INVALID_TRANSITION'); if (p.cash > job.total)
    fail('VALIDATION_ERROR', 400); if ((await db.prepare('SELECT job_id FROM driver_settlements WHERE job_id=? OR reference=?').get(job.id, p.reference)))
    fail('ALREADY_SETTLED'); const commission = Math.round(job.fare.total * policy.commission / 100); const net = job.fare.total - commission - p.cash; (await db.prepare('INSERT INTO driver_settlements VALUES(?,?,?,?,?,?,?,?)').run(job.id, job.driverId, job.fare.total, commission, p.cash, net, p.reference, at())); (await audit(user.id, 'DRIVER_SETTLEMENT', { ...p, commission, net })); await queueTransportReceipt(job.id); })); await deliverPaymentEmail('transport',p.jobId); }
export async function requestWithdrawal(user: Session, input: unknown) { (await approvedDriver(user)); const p = z.object({ amount: z.number().int().positive().max(100000), bank: z.string().trim().min(2).max(80), holder: z.string().trim().min(2).max(100), account: z.string().regex(/^\d{6,20}$/), idem: z.string().uuid() }).parse(input); return (await transaction(async () => { const old = (await db.prepare('SELECT id,driver_id FROM driver_withdrawals WHERE idem=?').get(p.idem)); if (old) {
    if (old.driver_id !== user.id)
        fail('FORBIDDEN', 403);
    return old.id;
} const policy = (await payPolicy()); if (!policy.enabled)
    fail('PAY_POLICY_DISABLED'); if (p.amount < policy.minimum)
    fail('WITHDRAWAL_MINIMUM'); if (p.amount > (await earnings(user.id)).available)
    fail('INSUFFICIENT_BALANCE'); const id = randomUUID(); (await db.prepare("INSERT INTO driver_withdrawals VALUES(?,?,?,?,'PENDING',NULL,'',?,?)").run(id, user.id, p.amount, encrypt(Buffer.from(JSON.stringify({ bank: p.bank, holder: p.holder, account: p.account }))), at(), p.idem)); (await audit(user.id, 'DRIVER_WITHDRAWAL_REQUESTED', { id, amount: p.amount })); return id; })); }
export async function reviewWithdrawal(user: Session, input: unknown) { admin(user); const p = z.object({ id: z.string().uuid(), status: z.enum(['PAID', 'REJECTED']), reference: z.string().trim().max(100), note: z.string().trim().min(5).max(500) }).parse(input); (await transaction(async () => { const row = (await db.prepare('SELECT status FROM driver_withdrawals WHERE id=?').get(p.id)); if (!row)
    fail('NOT_FOUND', 404); if (row!.status !== 'PENDING')
    fail('INVALID_TRANSITION'); if (p.status === 'PAID' && p.reference.length < 5)
    fail('REFERENCE_REQUIRED', 400); if (p.status === 'PAID' && (await db.prepare('SELECT id FROM driver_withdrawals WHERE reference=?').get(p.reference)))
    fail('DUPLICATE_REFERENCE'); (await db.prepare('UPDATE driver_withdrawals SET status=?,reference=?,note=? WHERE id=?').run(p.status, p.status === 'PAID' ? p.reference : null, p.note, p.id)); (await audit(user.id, 'DRIVER_WITHDRAWAL_REVIEW', p)); })); }
export async function dashboard(user: Session) {
    if (user.role === 'admin') {
        const withdrawals = (await db.prepare('SELECT w.*,u.name FROM driver_withdrawals w JOIN users u ON u.id=w.driver_id ORDER BY w.at DESC LIMIT 200').all()).map(row => ({ ...row, bank: JSON.parse(decrypt(row.bank as Uint8Array).toString()), idem: undefined }));
        const settled=new Set((await db.prepare('SELECT job_id FROM driver_settlements').all()).map(row=>String(row.job_id)));
        return { policy: (await payPolicy()), withdrawals, jobs: (await getJobs(user.id, 'admin')).filter(j => j.status === 'COMPLETED' && !settled.has(j.id)), settlements: (await db.prepare('SELECT * FROM driver_settlements ORDER BY at DESC LIMIT 200').all()) };
    }
    (await approvedDriver(user));
    return { work: (await workState(user.id)) || { online: 0, vehicle: (await application(user.id))?.personal?.vehicleType || 'pickup' }, policy: (await payPolicy()), earnings: (await earnings(user.id)), settlements: (await db.prepare('SELECT * FROM driver_settlements WHERE driver_id=? ORDER BY at DESC').all(user.id)), withdrawals: (await db.prepare('SELECT id,amount,status,note,at,reference FROM driver_withdrawals WHERE driver_id=? ORDER BY at DESC').all(user.id)) };
}
