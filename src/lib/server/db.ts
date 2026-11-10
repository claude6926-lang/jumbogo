import {randomUUID} from 'node:crypto';
import {initialVehicles,type Job,type Role,type Vehicle} from '../domain';
import {testJobAllowed} from '../test-accounts';
import {db,migrateSchema} from './database-client';
export {db,transaction} from './database-client';
(await db.migrate(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,role TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS vehicles(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),driver_id TEXT REFERENCES users(id),status TEXT NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id); CREATE INDEX IF NOT EXISTS jobs_driver ON jobs(driver_id);
 CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,kind TEXT NOT NULL,job_id TEXT REFERENCES jobs(id),idem TEXT UNIQUE NOT NULL,at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS campaigns(code TEXT PRIMARY KEY,amount INTEGER NOT NULL,min_spend INTEGER NOT NULL,active INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS grants(user_id TEXT PRIMARY KEY REFERENCES users(id),code TEXT NOT NULL REFERENCES campaigns(code),at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES jobs(id),sender TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL,text TEXT NOT NULL,at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS messages_job ON messages(job_id,at);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS requests(idem TEXT PRIMARY KEY,user_id TEXT NOT NULL,job_id TEXT NOT NULL REFERENCES jobs(id));
 CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),subject TEXT NOT NULL,status TEXT NOT NULL,at TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
 CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
 CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
 CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;`));
export const demoEnabled = process.env.DEMO_MODE === 'true' || (process.env.NODE_ENV === 'development' && process.env.DEMO_MODE !== 'false');
if (demoEnabled) {
    for (const [id, name, phone, role] of [['demo-user', 'ณัฐพล สุขใจ', '+66000000001', 'user'], ['demo-driver', 'สมชาย ใจดี', '+66000000000', 'driver'], ['demo-admin', 'JUMBO Operations', '+66000000002', 'admin']])
        (await db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?,1)').run(id, name, phone, role));
    (await db.prepare('INSERT OR IGNORE INTO campaigns VALUES(?,?,?,?)').run('JUMBO100', 100, 250, 1));
}
for (const vehicle of migrateSchema?initialVehicles:[])
    (await db.prepare('INSERT OR IGNORE INTO vehicles VALUES(?,?)').run(vehicle.id, JSON.stringify(vehicle)));
export async function audit(actor: string, action: string, detail: unknown) { (await db.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run(randomUUID(), actor, action, JSON.stringify(detail), new Date().toISOString())); }
export async function vehicles(): Promise<Vehicle[]> { return ((await db.prepare('SELECT data FROM vehicles').all()) as {
    data: string;
}[]).map(r => JSON.parse(r.data)); }
export async function balance(userId: string) { return ((await db.prepare('SELECT COALESCE(SUM(amount),0) AS balance FROM ledger WHERE user_id=?').get(userId)) as {
    balance: number;
}).balance; }
export async function ledger(userId: string) { return (await db.prepare('SELECT id,amount,kind,job_id AS jobId,at FROM ledger WHERE user_id=? ORDER BY at DESC').all(userId)); }
export async function getJob(id: string): Promise<Job | undefined> { const row = (await db.prepare('SELECT data FROM jobs WHERE id=?').get(id)) as {
    data: string;
} | undefined; return row ? JSON.parse(row.data) : undefined; }
export async function saveJob(job: Job) { (await db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET driver_id=excluded.driver_id,status=excluded.status,data=excluded.data').run(job.id, job.userId, job.driverId, job.status, JSON.stringify(job))); }
export async function getJobs(id: string, role: Role): Promise<Job[]> { const rows = role === 'admin' ? (await db.prepare('SELECT data FROM jobs ORDER BY rowid DESC').all()) : role === 'driver' ? (await db.prepare("SELECT data FROM jobs WHERE driver_id=? OR (status='SEARCHING' AND driver_id IS NULL) ORDER BY rowid DESC").all(id)) : (await db.prepare('SELECT data FROM jobs WHERE user_id=? ORDER BY rowid DESC').all(id)); return (rows as {
    data: string;
}[]).map(row => JSON.parse(row.data) as Job).filter(job=>role==='admin'||testJobAllowed(id,job.id)).map(job => { if (role === 'driver' && job.driverId !== id)
    delete job.contacts; return job; }); }

