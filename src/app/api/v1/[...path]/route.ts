import { NextRequest, NextResponse } from 'next/server';
import {queueTransportReceipt,deliverPaymentEmail} from '@/lib/server/payment-email';
import { AuthError, currentUser, demoLoginEnabled, driverApproved, requireOrigin } from '@/lib/server/auth-store';
import { adminOverview, updateTicket, manageUser } from '@/lib/server/admin-store';
import { applyLateCancellationFee } from '@/lib/server/wallet-store';
import {notificationFeed,readNotifications} from '@/lib/server/notifications';
import { createMapQuote, readMapQuote } from '@/lib/server/maps';
import { randomBytes, randomUUID } from 'node:crypto';
import { acceptanceError, startError } from '@/lib/driver-jobs';
import {testJobAllowed} from '@/lib/test-accounts';
import { acceptWorkError, hasProof } from '@/lib/server/driver-store';
import { z } from 'zod';
import { bookingSchema, canTransition, statuses, validateSchedule, type Job, type Session } from '@/lib/domain';
import { audit, balance, db, demoEnabled, getJob, getJobs, ledger, saveJob, transaction, vehicles } from '@/lib/server/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
async function session(req: NextRequest): Promise<Session> { return (await currentUser(req)) || fail(401, 'LOGIN_REQUIRED'); }
async function allowedJob(id: string, user: Session) { const job = (await getJob(id)); if (!job)
    fail(404, 'NOT_FOUND'); if (user.role !== 'admin' && job!.userId !== user.id && job!.driverId !== user.id)
    fail(403, 'FORBIDDEN'); return job!; }
function guard(req: NextRequest) { const origin = req.headers.get('origin'); if (origin) {
    let source: URL;
    try {
        source = new URL(origin);
    }
    catch {
        fail(403, 'ORIGIN_REJECTED');
    }
    if (!['http:', 'https:'].includes(source!.protocol) || source!.host !== req.headers.get('host'))
        fail(403, 'ORIGIN_REJECTED');
} }
const buckets = new Map<string, {
    count: number;
    until: number;
}>();
function throttle(key: string) { const now = Date.now(); if (buckets.size > 10000)
    for (const [k, v] of buckets)
        if (v.until < now)
            buckets.delete(k); const b = buckets.get(key); if (!b || b.until < now)
    buckets.set(key, { count: 1, until: now + 60000 });
else if (++b.count > 120)
    fail(429, 'RATE_LIMIT'); }
async function handler(req: NextRequest, ctx: {
    params: Promise<{
        path: string[];
    }>;
}) {
    try {
        const { path } = await ctx.params;
        const route = path.join('/');
        if (req.method === 'POST')
            guard(req);
        throttle(req.cookies.get('jumbo_session')?.value || 'anonymous');
        if (route === 'session' && req.method === 'GET') {
            let user: Session | null = null;
            try {
                user = (await session(req));
            }
            catch (e) {
                if (!(e instanceof HttpError) || e.status !== 401)
                    throw e;
            }
            return NextResponse.json({ user, demo: demoEnabled });
        }
        if (route === 'session' && req.method === 'POST') {
            if (!demoLoginEnabled)
                fail(403, 'DEMO_LOGIN_DISABLED');
            const { role } = z.object({ role: z.enum(['user', 'driver', 'admin']).default('user') }).parse(await req.json());
            const user = (await db.prepare('SELECT id,name,role,phone FROM users WHERE id=?').get(`demo-${role}`));
            const token = randomBytes(32).toString('hex');
            (await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, `demo-${role}`, Date.now() + 86400000));
            const response = NextResponse.json({ user, demo: true });
            response.cookies.set('jumbo_session', token, { httpOnly: true, sameSite: 'strict', secure: new URL(req.url).protocol === 'https:', maxAge: 86400, path: '/' });
            return response;
        }
        const user = (await session(req));
        if(route==='notifications'&&req.method==='GET')return NextResponse.json(await notificationFeed(user),{headers:{'Cache-Control':'private, no-store'}});
        if(route==='notifications/read'&&req.method==='POST'){
            requireOrigin(req);
            const {ids}=z.object({ids:z.array(z.string().min(1).max(160)).max(100)}).parse(await req.json());
            return NextResponse.json(await readNotifications(user,ids),{headers:{'Cache-Control':'private, no-store'}});
        }
        if (route === 'bootstrap')
            return NextResponse.json({ user, demo: user.id.startsWith('demo-') && demoLoginEnabled, vehicles: (await vehicles()), jobs: (await driverApproved(user)) ? (await getJobs(user.id, user.role)) : [], balance: (await balance(user.id)), ledger: (await ledger(user.id)) });
        if (route === 'logout' && req.method === 'POST') {
            (await db.prepare('DELETE FROM sessions WHERE token=?').run(req.cookies.get('jumbo_session')?.value || ''));
            const r = NextResponse.json({ ok: true });
            r.cookies.delete('jumbo_session');
            return r;
        }
        if (route === 'quote' && req.method === 'POST') {
            const input = bookingSchema.parse(await req.json());
            validateSchedule(input.scheduledAt);
            const vehicle = (await vehicles()).find(v => v.id === input.vehicle) || fail(400, 'INVALID_VEHICLE');
            if (user.role !== 'user')
                fail(403, 'FORBIDDEN');
            return NextResponse.json(await createMapQuote(user.id, input, vehicle), { headers: { 'Cache-Control': 'private, no-store' } });
        }
        if (route === 'jobs' && req.method === 'GET')
            return NextResponse.json((await driverApproved(user)) ? (await getJobs(user.id, user.role)) : []);
        if (route === 'jobs' && req.method === 'POST') {
            if (user.role !== 'user')
                fail(403, 'FORBIDDEN');
            const input = bookingSchema.parse(await req.json());
            validateSchedule(input.scheduledAt);
            const idem = z.string().uuid().parse(req.headers.get('idempotency-key'));
            const result = (await transaction(async () => {
                const prior = (await db.prepare('SELECT job_id,user_id FROM requests WHERE idem=?').get(idem)) as {
                    job_id: string;
                    user_id: string;
                } | undefined;
                if (prior) {
                    if (prior.user_id !== user.id)
                        fail(409, 'IDEMPOTENCY_CONFLICT');
                    return (await getJob(prior.job_id));
                }
                const { fare } = await readMapQuote(user.id, input);
                const available = (await balance(user.id));
                const credit = input.useCredit ? Math.min(Math.max(0, available), fare.total) : 0;
                if (input.payment === 'wallet' && credit < fare.total)
                    fail(400, 'INSUFFICIENT_BALANCE');
                const job: Job = { id: randomUUID(), userId: user.id, driverId: null, locations: input.locations, pickup: input.pickup, drops: input.drops, contacts: input.contacts, services:{helperCount:input.helper?1+(input.extraHelpers||0):0,pickupStairs:input.pickupStairs||0,dropStairs:input.dropStairs||0}, vehicle: input.vehicle, status: 'SEARCHING', fare, credit, total: fare.total - credit, note: input.note, scheduledAt: input.scheduledAt, createdAt: new Date().toISOString(), history: [{ from: null, to: 'CREATED', at: new Date().toISOString(), actor: user.id }, { from: 'CREATED', to: 'SEARCHING', at: new Date().toISOString(), actor: user.id }] };
                (await saveJob(job));
                if (credit)
                    (await db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(randomUUID(), user.id, -credit, 'BOOKING', job.id, `debit-${job.id}`, job.createdAt));
                (await db.prepare('INSERT INTO requests VALUES(?,?,?)').run(idem, user.id, job.id));
                (await audit(user.id, 'BOOKING_CREATED', { job: job.id, fare, credit }));
                return job;
            }));
            return NextResponse.json(result, { status: 201 });
        }
        if (path[0] === 'jobs' && path[2] === 'status' && req.method === 'POST') {
            const { status, reason } = z.object({ status: z.enum(statuses), reason: z.string().max(500).optional() }).parse(await req.json());
            const job = (await transaction(async () => {
                const job = (await getJob(path[1])) || fail(404, 'NOT_FOUND');
                if(user.role!=='admin'&&!testJobAllowed(user.id,job.id))fail(403,'TEST_JOB_RESTRICTED');
                if (status === 'ACCEPTED') {
                    if (user.role !== 'driver')
                        fail(403, 'FORBIDDEN');
                    if (!(await driverApproved(user)))
                        fail(403, 'DRIVER_NOT_APPROVED');
                    const availability = (await acceptWorkError(user.id, job.vehicle));
                    if (availability)
                        fail(409, availability);
                    const conflict = acceptanceError(job, (await getJobs(user.id, 'driver')), user.id);
                    if (conflict)
                        fail(409, conflict);
                }
                else
                    (await allowedJob(job.id, user));
                if (user.role === 'user' && status !== 'CANCELLED')
                    fail(403, 'FORBIDDEN');
                if (!canTransition(job.status, status))
                    fail(409, 'INVALID_TRANSITION');
                if (status === 'ARRIVING' && job.driverId) {
                    const conflict = startError(job, (await getJobs(job.driverId, 'driver')));
                    if (conflict)
                        fail(409, conflict);
                }
                if (status === 'COMPLETED' && !(await hasProof(job.id)))
                    fail(409, 'PROOF_REQUIRED');
                if (status === 'CANCELLED' && !reason?.trim())
                    fail(400, 'REASON_REQUIRED');
                if (status === 'ACCEPTED') {
                    job.driverId = user.id;
                    job.driverName = user.name;
                    job.driverPhone = user.phone;
                }
                const changedAt = new Date().toISOString();
                job.history.push({ from: job.status, to: status, at: changedAt, actor: user.id, reason });
                job.status = status;
                (await saveJob(job));
                if (status === 'CANCELLED' && job.credit)
                    (await db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(randomUUID(), job.userId, job.credit, 'REFUND', job.id, `refund-${job.id}`, changedAt));
                if (status === 'CANCELLED')
                    (await applyLateCancellationFee(user, job, reason || ''));
                (await audit(user.id, 'SHIPMENT_STATUS', { job: job.id, status, reason }));
                if(status==='COMPLETED')await queueTransportReceipt(job.id);
                return job;
            }));
            if(job.status==='COMPLETED')await deliverPaymentEmail('transport',job.id);
            return NextResponse.json(job);
        }
        if (path[0] === 'jobs' && path[2] === 'messages') {
            const job = (await allowedJob(path[1], user));
            if (req.method === 'GET')
                return NextResponse.json((await db.prepare('SELECT id,job_id AS jobId,sender,role,text,at FROM messages WHERE job_id=? ORDER BY at ASC').all(job.id)));
            const { text } = z.object({ text: z.string().trim().min(1).max(2000) }).parse(await req.json());
            if (!job.driverId)
                fail(409, 'DRIVER_NOT_ASSIGNED');
            const message = { id: randomUUID(), jobId: job.id, sender: user.id, role: user.role, text, at: new Date().toISOString() };
            (await db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(message.id, job.id, user.id, user.role, text, message.at));
            return NextResponse.json(message, { status: 201 });
        }
        if (route === 'wallet/claim' && req.method === 'POST') {
            if (user.role !== 'user')
                fail(403, 'FORBIDDEN');
            const { code } = z.object({ code: z.string().max(40) }).parse(await req.json());
            const credit = (await transaction(async () => {
                const campaign = (await db.prepare('SELECT * FROM campaigns WHERE code=? AND active=1').get(code)) as {
                    amount: number;
                } | undefined;
                if (!campaign)
                    fail(400, 'CAMPAIGN_INVALID');
                const verified = (await db.prepare('SELECT verified FROM users WHERE id=?').get(user.id)) as {
                    verified: number;
                };
                if (!verified.verified)
                    fail(403, 'PHONE_UNVERIFIED');
                if ((await db.prepare('SELECT user_id FROM grants WHERE user_id=?').get(user.id)))
                    fail(409, 'CREDIT_ALREADY_CLAIMED');
                if ((await db.prepare('SELECT id FROM jobs WHERE user_id=?').get(user.id)))
                    fail(409, 'FIRST_CUSTOMER_ONLY');
                const at = new Date().toISOString();
                (await db.prepare('INSERT INTO grants VALUES(?,?,?)').run(user.id, code, at));
                (await db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(randomUUID(), user.id, campaign!.amount, 'WELCOME', null, `welcome-${user.id}`, at));
                (await audit(user.id, 'WELCOME_CREDIT', { code, amount: campaign!.amount }));
                return campaign!.amount;
            }));
            return NextResponse.json({ credit, balance: (await balance(user.id)) });
        }
        if (route === 'profile' && req.method === 'POST') {
            const { name, phone } = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().regex(/^0[689]\d{8}$/).optional() }).parse(await req.json());
            (await transaction(async () => {
                if (phone !== undefined) {
                    if (user.phone && phone !== user.phone)
                        fail(409, 'PHONE_ALREADY_SET');
                    if ((await db.prepare("SELECT user_id FROM accounts WHERE phone=? AND (role=? OR role='admin') AND user_id!=?").get(phone, user.role, user.id)))
                        fail(409, 'PHONE_IN_USE');
                    (await db.prepare('UPDATE accounts SET phone=? WHERE user_id=?').run(phone, user.id));
                    (await db.prepare('UPDATE users SET phone=? WHERE id=?').run(phone, user.id));
                }
                (await db.prepare('UPDATE users SET name=? WHERE id=?').run(name, user.id));
            }));
            return NextResponse.json({ ok: true });
        }
        if (route === 'support' && req.method === 'POST') {
            const { subject } = z.object({ subject: z.string().trim().min(5).max(1000) }).parse(await req.json());
            const id = randomUUID();
            (await db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?)').run(id, user.id, subject, 'OPEN', new Date().toISOString()));
            return NextResponse.json({ id });
        }
        if (path[0] === 'admin') {
            if (user.role !== 'admin')
                fail(403, 'FORBIDDEN');
            if (req.method === 'POST')
                requireOrigin(req);
            if(path[1]==='users'&&path.length===3&&req.method==='POST') return NextResponse.json(await manageUser(user,path[2],await req.json()));
            if (route === 'admin/overview' && req.method === 'GET')
                return NextResponse.json((await adminOverview(user)), { headers: { 'Cache-Control': 'private, no-store' } });
            if (path[1] === 'support' && path.length === 3 && req.method === 'POST')
                return NextResponse.json((await updateTicket(user, path[2], await req.json())));
            if (route === 'admin/pricing' && req.method === 'POST') {
                const input = z.object({ id: z.string(), base: z.number().int().min(0).max(100000), rate: z.number().min(0).max(1000) }).parse(await req.json());
                const v = (await vehicles()).find(v => v.id === input.id) || fail(404, 'NOT_FOUND');
                (await transaction(async () => { (await db.prepare('UPDATE vehicles SET data=? WHERE id=?').run(JSON.stringify({ ...v, base: input.base, rate: input.rate }), v.id)); (await audit(user.id, 'PRICING_UPDATED', input)); }));
                return NextResponse.json({ ok: true });
            }
        }
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    catch (error) {
        const status = error instanceof HttpError || error instanceof AuthError ? error.status : error instanceof z.ZodError ? 400 : error instanceof Error && error.message === 'SCHEDULE_RANGE' ? 400 : 500;
        if (status === 500)
            console.error(error);
        return NextResponse.json({ error: error instanceof HttpError || error instanceof AuthError ? error.message : error instanceof z.ZodError ? 'VALIDATION_ERROR' : error instanceof Error && error.message === 'SCHEDULE_RANGE' ? 'SCHEDULE_RANGE' : 'INTERNAL_ERROR' }, { status });
    }
}
export const GET = handler;
export const POST = handler;
