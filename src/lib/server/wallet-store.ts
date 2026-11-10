import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { paymentMode } from './wallet-payments';
import { db, balance, transaction, audit, getJob } from './db';
import { AuthError, encrypt, decrypt } from './auth-store';
import type { Job, Session } from '../domain';
import type { Bank, Topup, WalletPolicy, WalletRecord } from '../wallet-domain';
(await db.migrate(`CREATE TABLE IF NOT EXISTS wallet_banks(id TEXT PRIMARY KEY,data TEXT NOT NULL,qr BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS wallet_topups(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,bank TEXT NOT NULL,slip BLOB NOT NULL,fingerprint TEXT UNIQUE NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',reference TEXT UNIQUE,at TEXT NOT NULL,idem TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS wallet_policy(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wallet_notes(ledger_id TEXT PRIMARY KEY REFERENCES ledger(id),actor TEXT NOT NULL,reason TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS wallet_topups_user ON wallet_topups(user_id,at);`));
const positive = z.number().int().min(1).max(100000);
const reasonSchema = z.string().trim().min(5).max(500);
const LATE_CANCELLATION_NOTICE_MS = 30 * 60 * 1000;
function admin(user: Session) { if (user.role !== 'admin')
    throw new AuthError(403, 'FORBIDDEN'); }
async function member(id: string) { const u = (await db.prepare('SELECT id,role FROM users WHERE id=?').get(id)) as {
    id: string;
    role: string;
} | undefined; if (!u || u.role === 'admin')
    throw new AuthError(400, 'INVALID_WALLET'); return u; }
export async function walletHistory(user: Session, id = user.id): Promise<WalletRecord[]> { if (user.role !== 'admin' && user.id !== id)
    throw new AuthError(403, 'FORBIDDEN'); return (await db.prepare("SELECT l.id,l.amount,l.kind,l.at,l.job_id AS jobId,COALESCE(n.reason,'') AS reason FROM ledger l LEFT JOIN wallet_notes n ON n.ledger_id=l.id WHERE l.user_id=? ORDER BY l.at DESC LIMIT 200").all(id)) as WalletRecord[]; }
export async function walletPolicy(): Promise<WalletPolicy> { const row = (await db.prepare('SELECT data FROM wallet_policy WHERE id=1').get()) as {
    data: string;
} | undefined; return row ? JSON.parse(row.data) : { enabled: false, allowNegative: false, cancellationFee: 0, noShowFee: 0 }; }
export async function savePolicy(user: Session, input: unknown) { admin(user); const p = z.object({ enabled: z.boolean(), allowNegative: z.boolean(), cancellationFee: positive.or(z.literal(0)), noShowFee: positive.or(z.literal(0)) }).parse(input); (await transaction(async () => { (await db.prepare('INSERT INTO wallet_policy VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(p))); (await audit(user.id, 'WALLET_POLICY_UPDATED', p)); })); }
export async function banks(all = false): Promise<Bank[]> { return ((await db.prepare('SELECT data FROM wallet_banks').all()) as {
    data: string;
}[]).map(r => JSON.parse(r.data) as Bank).filter(b => all || b.active); }
export async function saveBank(user: Session, input: unknown, qr?: Buffer) { admin(user); const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(2).max(80), accountName: z.string().trim().min(2).max(100), accountNumber: z.string().trim().min(5).max(30), active: z.boolean() }).parse(input); const id = b.id || randomUUID(); (await transaction(async () => { const old = (await db.prepare('SELECT qr FROM wallet_banks WHERE id=?').get(id)) as {
    qr: Uint8Array;
} | undefined; if (!qr && !old)
    throw new AuthError(400, 'QR_REQUIRED'); (await db.prepare('INSERT INTO wallet_banks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,qr=excluded.qr').run(id, JSON.stringify({ ...b, id, revision: randomUUID() }), qr ? encrypt(qr) : old!.qr)); (await audit(user.id, 'WALLET_BANK_UPDATED', { id, name: b.name, active: b.active })); })); return id; }
async function entry(userId: string, amount: number, kind: string, idem: string, actor: string, reason: string, jobId: string | null = null, at = new Date().toISOString()) { const id = randomUUID(); (await db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(id, userId, amount, kind, jobId, idem, at)); (await db.prepare('INSERT INTO wallet_notes VALUES(?,?,?)').run(id, actor, reason)); (await audit(actor, kind, { ledgerId: id, userId, amount, jobId, reason })); return id; }
export async function submitTopup(user: Session, input: unknown, slip: Buffer) { (await member(user.id)); const p = z.object({ amount: positive, bankId: z.string().uuid(), revision: z.string().uuid(), idem: z.string().uuid() }).parse(input); const hash = createHash('sha256').update(slip).digest('hex'); return (await transaction(async () => { const old = (await db.prepare('SELECT id,user_id FROM wallet_topups WHERE idem=?').get(p.idem)) as {
    id: string;
    user_id: string;
} | undefined; if (old) {
    if (old.user_id !== user.id)
        throw new AuthError(409, 'IDEMPOTENCY_CONFLICT');
    return old.id;
} const bank = (await banks()).find(b => b.id === p.bankId); if (!bank || bank.revision !== p.revision)
    throw new AuthError(409, 'BANK_UNAVAILABLE'); if ((await db.prepare('SELECT id FROM wallet_topups WHERE fingerprint=?').get(hash)))
    throw new AuthError(409, 'DUPLICATE_SLIP'); const id = randomUUID(); (await db.prepare("INSERT INTO wallet_topups(id,user_id,amount,bank,slip,fingerprint,status,at,idem) VALUES(?,?,?,?,?,?,'PENDING',?,?)").run(id, user.id, p.amount, JSON.stringify(bank), encrypt(slip), hash, new Date().toISOString(), p.idem)); (await audit(user.id, 'WALLET_TOPUP_SUBMITTED', { id, amount: p.amount, bankId: bank.id })); return id; })); }
export async function reviewTopup(user: Session, input: unknown) { admin(user); const p = z.object({ id: z.string().uuid(), approve: z.boolean(), reason: reasonSchema, reference: z.string().trim().max(100).default('') }).parse(input); return (await transaction(async () => { const row = (await db.prepare('SELECT * FROM wallet_topups WHERE id=?').get(p.id)) as {
    user_id: string;
    amount: number;
    status: string;
} | undefined; if (!row)
    throw new AuthError(404, 'NOT_FOUND'); if (row.status !== 'PENDING')
    throw new AuthError(409, 'ALREADY_REVIEWED'); const reference = p.reference.toUpperCase(); if (p.approve && reference.length < 5)
    throw new AuthError(400, 'BANK_REFERENCE_REQUIRED'); if (p.approve && (await db.prepare('SELECT id FROM wallet_topups WHERE reference=?').get(reference)))
    throw new AuthError(409, 'DUPLICATE_BANK_REFERENCE'); (await db.prepare('UPDATE wallet_topups SET status=?,reason=?,reference=? WHERE id=?').run(p.approve ? 'APPROVED' : 'REJECTED', p.reason, p.approve ? reference : null, p.id)); if (p.approve)
    (await entry(row.user_id, row.amount, 'TOPUP', `topup-${p.id}`, user.id, p.reason)); (await audit(user.id, 'WALLET_TOPUP_REVIEWED', { id: p.id, approved: p.approve, reason: p.reason })); })); }
export async function adjustWallet(user: Session, input: unknown) { admin(user); const p = z.object({ userId: z.string(), amount: z.number().int().min(-100000).max(100000).refine(n => n !== 0), reason: reasonSchema, idem: z.string().uuid() }).parse(input); return (await transaction(async () => { (await member(p.userId)); const prior = (await db.prepare('SELECT user_id,amount FROM ledger WHERE idem=?').get(p.idem)) as {
    user_id: string;
    amount: number;
} | undefined; if (prior) {
    if (prior.user_id !== p.userId || prior.amount !== p.amount)
        throw new AuthError(409, 'IDEMPOTENCY_CONFLICT');
    return;
} if ((await balance(p.userId)) + p.amount < 0 && !(await walletPolicy()).allowNegative)
    throw new AuthError(409, 'NEGATIVE_DISABLED'); (await entry(p.userId, p.amount, 'ADMIN_ADJUSTMENT', p.idem, user.id, p.reason)); })); }
function hasLateCustomerCancellation(job: Job, userId: string) {
    if (job.userId !== userId || !job.driverId || !job.scheduledAt)
        return false;
    const event = [...job.history].reverse().find(h => h.to === 'CANCELLED' && h.actor === userId);
    if (!event)
        return false;
    const scheduledAt = Date.parse(job.scheduledAt);
    const cancelledAt = Date.parse(event.at);
    return Number.isFinite(scheduledAt) && Number.isFinite(cancelledAt) && scheduledAt - cancelledAt < LATE_CANCELLATION_NOTICE_MS;
}
export async function applyLateCancellationFee(actor: Session, job: Job, reason: string) {
    if (actor.role !== 'user' || actor.id !== job.userId || !hasLateCustomerCancellation(job, actor.id))
        return false;
    const policy = await walletPolicy();
    if (!policy.enabled || !policy.cancellationFee)
        return false;
    const idem = `penalty-${job.id}-${actor.id}`;
    if (await db.prepare('SELECT id FROM ledger WHERE idem=?').get(idem))
        return false;
    const cancelledAt = job.history.at(-1)?.at || new Date().toISOString();
    const when = new Date(Date.parse(cancelledAt) + 1).toISOString();
    const details = `ยกเลิกงานน้อยกว่า 30 นาทีก่อนเวลารับงาน · ${reason.trim() || 'ไม่แจ้งล่วงหน้าตามกำหนด'}`;
    await entry(actor.id, -policy.cancellationFee, 'CANCELLATION_FEE', idem, actor.id, details, job.id, when);
    return true;
}
// Penalties are adjudicated by an administrator, never inferred from a GPS gap.
export async function assessFee(user: Session, input: unknown) { admin(user); const p = z.object({ userId: z.string(), jobId: z.string(), kind: z.enum(['CANCELLATION_FEE', 'NO_SHOW_FEE']), reason: reasonSchema, amount: positive }).parse(input); return (await transaction(async () => { (await member(p.userId)); const policy = (await walletPolicy()); const amount = p.kind === 'CANCELLATION_FEE' ? policy.cancellationFee : policy.noShowFee; if (!policy.enabled || !amount)
    throw new AuthError(409, 'FEES_DISABLED'); if (amount !== p.amount)
    throw new AuthError(409, 'POLICY_CHANGED'); const job = (await getJob(p.jobId)); if (!job || (job.userId !== p.userId && job.driverId !== p.userId))
    throw new AuthError(400, 'INVALID_JOB_MEMBER'); if (!['CANCELLED', 'FAILED'].includes(job.status))
    throw new AuthError(409, 'JOB_NOT_CLOSED'); const idem = `penalty-${job.id}-${p.userId}`; if ((await db.prepare('SELECT id FROM ledger WHERE idem=?').get(idem)))
    throw new AuthError(409, 'FEE_ALREADY_APPLIED'); if (p.kind === 'CANCELLATION_FEE' && !hasLateCustomerCancellation(job, p.userId))
    throw new AuthError(409, 'CANCELLATION_NOT_LATE'); if ((await balance(p.userId)) - amount < 0 && !(p.kind === 'CANCELLATION_FEE' || policy.allowNegative))
    throw new AuthError(409, 'NEGATIVE_DISABLED'); (await entry(p.userId, -amount, p.kind, idem, user.id, p.reason, job.id)); })); }
export async function walletData(user: Session) { const all = user.role === 'admin'; const rows = (await db.prepare(`SELECT t.id,t.user_id AS userId,u.name,u.role,t.amount,t.bank,t.status,t.reason,COALESCE(t.reference,'') AS reference,t.at FROM wallet_topups t JOIN users u ON u.id=t.user_id ${all ? '' : 'WHERE t.user_id=?'} ORDER BY t.at DESC LIMIT 200`).all(...(all ? [] : [user.id]))) as (Omit<Topup, 'bank'> & {
    bank: string;
})[]; return { paymentMode: paymentMode(), entries: (await walletHistory(user)), banks: (await banks(all)), policy: (await walletPolicy()), topups: rows.map(r => ({ ...r, bank: JSON.parse(r.bank) })), ...(all ? { users: (await Promise.all(((await db.prepare("SELECT id,name,role FROM users WHERE role IN ('user','driver') AND id NOT LIKE 'demo-%'").all()) as {
            id: string;
            name: string;
            role: string;
        }[]).map(async (u) => ({ ...u, balance: (await balance(u.id)) })))) } : {}) }; }
export async function walletImage(user: Session, kind: string, id: string) { if (kind === 'qr') {
    const row = (await db.prepare('SELECT qr,data FROM wallet_banks WHERE id=?').get(id)) as {
        qr: Uint8Array;
        data: string;
    } | undefined;
    if (!row || (!JSON.parse(row.data).active && user.role !== 'admin'))
        throw new AuthError(404, 'NOT_FOUND');
    return decrypt(row.qr);
} const row = (await db.prepare('SELECT slip,user_id FROM wallet_topups WHERE id=?').get(id)) as {
    slip: Uint8Array;
    user_id: string;
} | undefined; if (!row)
    throw new AuthError(404, 'NOT_FOUND'); if (user.role !== 'admin' && row.user_id !== user.id)
    throw new AuthError(403, 'FORBIDDEN'); return decrypt(row.slip); }
