import {publishedContent} from './cms-store';
import {termsConsentVersion,PRIVACY_VERSION} from '../terms';
import {isTestAccount,testRequestAllowed} from '../test-accounts';
import {migrateSchema} from './database-client';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { db, audit, transaction } from './db';
import type { Session } from '../domain';
import type { AuthRole, DriverApplication, DriverPersonal, DocumentKind } from '../auth-domain';
(await db.migrate(`CREATE TABLE IF NOT EXISTS accounts(user_id TEXT PRIMARY KEY REFERENCES users(id),email TEXT NOT NULL,phone TEXT NOT NULL,role TEXT NOT NULL,password_hash TEXT,created_at TEXT NOT NULL,UNIQUE(email,role),UNIQUE(phone,role));
CREATE TABLE IF NOT EXISTS consents(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),version TEXT NOT NULL,at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS identities(provider TEXT NOT NULL,subject TEXT NOT NULL,role TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(provider,subject,role));
CREATE TABLE IF NOT EXISTS oauth_flows(id TEXT PRIMARY KEY,state TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,provider TEXT NOT NULL,role TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_pending(id TEXT PRIMARY KEY,provider TEXT NOT NULL,subject TEXT NOT NULL,role TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS driver_applications(user_id TEXT PRIMARY KEY REFERENCES users(id),status TEXT NOT NULL,personal BLOB,reason TEXT,submitted_at TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS driver_documents(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,encrypted BLOB NOT NULL,uploaded_at TEXT NOT NULL,UNIQUE(user_id,kind));`));
export class AuthError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
// Social accounts can be created before a contact phone is supplied. NULL keeps
// the unique phone constraint meaningful without inventing a phone number.
if (migrateSchema && ((await db.prepare('PRAGMA table_info(accounts)').all()) as {
    name: string;
    notnull: number;
}[]).some(c => c.name === 'phone' && c.notnull)) {
    (await transaction(async () => {
        (await db.migrate(`CREATE TABLE accounts_nullable_phone(user_id TEXT PRIMARY KEY REFERENCES users(id),email TEXT NOT NULL,phone TEXT,role TEXT NOT NULL,password_hash TEXT,created_at TEXT NOT NULL,UNIQUE(email,role),UNIQUE(phone,role));
 INSERT INTO accounts_nullable_phone SELECT * FROM accounts;
 DROP TABLE accounts;
 ALTER TABLE accounts_nullable_phone RENAME TO accounts;`));
    }));
}
// Called only inside the account-creation transaction: a failed signup awards nothing.
async function welcomeCredit(userId: string) {
    const at = new Date().toISOString();
    (await db.prepare("INSERT OR IGNORE INTO campaigns VALUES('SIGNUP100',100,0,0)").run());
    (await db.prepare("INSERT INTO grants VALUES(?,'SIGNUP100',?)").run(userId, at));
    (await db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(randomUUID(), userId, 100, 'WELCOME', null, `welcome-${userId}`, at));
    (await audit(userId, 'WELCOME_CREDIT', { code: 'SIGNUP100', amount: 100, automatic: true }));
}
export async function googleCustomer(subject: string, name: string, email: string) {
    return (await transaction(async () => {
        const existing = (await db.prepare("SELECT user_id FROM identities WHERE provider='google' AND subject=? AND role='user'").get(subject)) as {
            user_id: string;
        } | undefined;
        if (existing)
            return existing.user_id;
        // An email match is not permission to take over an existing password account.
        if ((await db.prepare("SELECT user_id FROM accounts WHERE email=? AND role IN ('user','admin')").get(email)))
            throw new AuthError(409, 'ACCOUNT_EXISTS');
        const id = randomUUID(), at = new Date().toISOString();
        (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(id, name || 'Google user', '', 'user'));
        (await db.prepare('INSERT INTO accounts VALUES(?,?,NULL,?,NULL,?)').run(id, email, 'user', at));
        (await db.prepare('INSERT INTO identities VALUES(?,?,?,?)').run('google', subject, 'user', id));
        (await welcomeCredit(id));
        (await audit(id, 'ACCOUNT_REGISTERED', { role: 'user', method: 'google' }));
        return id;
    }));
}
export function requireOrigin(req: NextRequest) { const origin = req.headers.get('origin'); if (!origin || new URL(origin).host !== req.headers.get('host'))
    throw new AuthError(403, 'ORIGIN_REJECTED'); }
export async function rateLimit(key: string, max = 12, window = 15 * 60000) { const hashed = createHash('sha256').update(key).digest('hex'); const now = Date.now(); (await transaction(async () => { (await db.prepare('DELETE FROM auth_limits WHERE expires<?').run(now)); const row = (await db.prepare('SELECT count FROM auth_limits WHERE key=?').get(hashed)) as {
    count: number;
} | undefined; if (row && row.count >= max)
    throw new AuthError(429, 'RATE_LIMIT'); (await db.prepare('INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(hashed, now + window)); })); }
export const demoLoginEnabled = process.env.ENABLE_DEMO_LOGIN === 'true' && process.env.NODE_ENV !== 'production';
await db.migrate('CREATE TABLE IF NOT EXISTS admin_session_roles(token TEXT PRIMARY KEY REFERENCES sessions(token) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN (\'admin\',\'user\',\'driver\')));');
await db.migrate('CREATE TABLE IF NOT EXISTS admin_business_sessions(token TEXT PRIMARY KEY REFERENCES sessions(token) ON DELETE CASCADE);');
export async function isAdminDriver(user:Session){return user.role==='driver'&&!!await db.prepare("SELECT id FROM users WHERE id=? AND role='admin'").get(user.id);}
export async function currentUser(req: NextRequest): Promise<Session | null> { const token = req.cookies.get('jumbo_session')?.value;const user=token?await sessionForToken(token):null;if(user&&isTestAccount(user.id)&&!testRequestAllowed(new URL(req.url).pathname,req.method))throw new AuthError(403,'TEST_ACCOUNT_RESTRICTED');return user; }
export async function sessionForToken(token: string): Promise<Session | null> { const user = (await db.prepare('SELECT u.id,u.name,u.phone,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(token, Date.now())) as Session | undefined; if (user?.id.startsWith('demo-') && !demoLoginEnabled)
    return null;if(user?.role==='admin'){const mode=await db.prepare('SELECT role FROM admin_session_roles WHERE token=?').get(token);const business=await db.prepare('SELECT token FROM admin_business_sessions WHERE token=?').get(token);return {...user,adminAccount:true,businessAccount:!!business&&mode?.role==='user',role:(mode?.role||'admin') as Session['role']};} return user ?? null; }
export async function switchAdminRole(req:NextRequest,role:Session['role']|'business'){
 const token=req.cookies.get('jumbo_session')?.value||'';
 const admin=await db.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.role='admin'").get(token,Date.now());
 if(!admin)throw new AuthError(403,'ADMIN_ONLY');
 const response=await issueSession(req,String(admin.id),NextResponse.json({next:role==='business'?'/company':role==='admin'?'/admin':`/${role}/home`}));
 const nextToken=response.cookies.get('jumbo_session')!.value;
 await transaction(async()=>{await db.prepare('INSERT INTO admin_session_roles VALUES(?,?)').run(nextToken,role==='business'?'user':role);if(role==='business')await db.prepare('INSERT INTO admin_business_sessions VALUES(?)').run(nextToken);await audit(String(admin.id),'ADMIN_ROLE_SWITCH',{role,mode:'live'});});return response;
}
export async function requireUser(req: NextRequest) { const user = (await currentUser(req)); if (!user)
    throw new AuthError(401, 'LOGIN_REQUIRED'); return user; }
export async function issueSession(req: NextRequest, userId: string, response: NextResponse) { const old = req.cookies.get('jumbo_session')?.value; const token = randomBytes(32).toString('hex'); (await transaction(async () => { if (old)
    (await db.prepare('DELETE FROM sessions WHERE token=?').run(old)); (await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now())); (await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, userId, Date.now() + 86400000)); })); response.cookies.set('jumbo_session', token, { httpOnly: true, sameSite: 'lax', secure: new URL(req.url).protocol === 'https:' || process.env.APP_URL?.startsWith('https://'), path: '/', maxAge: 86400 }); return response; }
function derive(password: string, salt: string) { return new Promise<Buffer>((resolve, reject) => { scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)); }); }
export async function hashPassword(password: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${(await derive(password, salt)).toString('hex')}`; }
export async function checkPassword(password: string, stored?: string | null) { const [salt, key] = (stored || '00000000000000000000000000000000:' + '0'.repeat(128)).split(':'); const result = await derive(password, salt); const expected = Buffer.from(key, 'hex'); return expected.length === result.length && timingSafeEqual(result, expected) && !!stored; }
export async function createAccount(input: {
    name: string;
    email: string;
    phone: string;
    role: AuthRole;
    contentRevision?: number;
}, passwordHash: string | null, identity?: {
    provider: string;
    subject: string;
    pendingToken?: string;
}, onCreated?: (id: string) => void) { return (await transaction(async () => { const content=await publishedContent();if((input.contentRevision??0)!==content.revision)throw new AuthError(409,'TERMS_UPDATED');const suffix=content.revision?'-cms-'+content.revision:''; if (identity?.pendingToken && !(await db.prepare('SELECT id FROM oauth_pending WHERE id=? AND provider=? AND subject=? AND role=? AND expires>?').get(identity.pendingToken, identity.provider, identity.subject, input.role, Date.now())))
    throw new AuthError(401, 'SOCIAL_EXPIRED'); if ((await db.prepare("SELECT user_id FROM accounts WHERE (role=? OR role='admin') AND (email=? OR phone=?)").get(input.role, input.email, input.phone)))
    throw new AuthError(409, 'ACCOUNT_EXISTS'); const id = randomUUID(), at = new Date().toISOString(); (await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(id, input.name, input.phone, input.role)); (await db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?)').run(id, input.email, input.phone, input.role, passwordHash, at)); (await db.prepare('INSERT INTO consents VALUES(?,?,?,?)').run(randomUUID(), id, termsConsentVersion(input.role)+suffix, at)); (await db.prepare('INSERT INTO consents VALUES(?,?,?,?)').run(randomUUID(), id, 'privacy-'+PRIVACY_VERSION+suffix, at)); if (identity)
    (await db.prepare('INSERT INTO identities VALUES(?,?,?,?)').run(identity.provider, identity.subject, input.role, id)); if (input.role === 'driver')
    (await db.prepare('INSERT INTO driver_applications VALUES(?,?,NULL,NULL,NULL,?)').run(id, 'DRAFT', at)); if (identity?.pendingToken)
    (await db.prepare('DELETE FROM oauth_pending WHERE id=?').run(identity.pendingToken)); if (input.role === 'user')
    (await welcomeCredit(id)); (await onCreated?.(id)); (await audit(id, 'ACCOUNT_REGISTERED', { role: input.role, method: identity?.provider || 'password' })); return id; })); }
let keyCache: Buffer | undefined;
function encryptionKey() { if (keyCache)
    return keyCache; const configured = process.env.DOCUMENT_ENCRYPTION_KEY; if (configured) {
    if (!/^[a-f0-9]{64}$/i.test(configured))
        throw new AuthError(503, 'STORAGE_NOT_CONFIGURED');
    return keyCache = Buffer.from(configured, 'hex');
} if (process.env.NODE_ENV === 'production')
    throw new AuthError(503, 'STORAGE_NOT_CONFIGURED'); const path = join(dirname(process.env.DATABASE_PATH || './data/jumbogo.db'), 'document-key'); try {
    return keyCache = readFileSync(path);
}
catch {
    const key = randomBytes(32);
    try {
        writeFileSync(path, key, { flag: 'wx', mode: 0o600 });
        return keyCache = key;
    }
    catch {
        return keyCache = readFileSync(path);
    }
} }
export function encrypt(data: Buffer) { const key = encryptionKey(); const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(data), cipher.final(), cipher.getAuthTag()]); }
export function decrypt(data: Uint8Array) { const b = Buffer.from(data); const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), b.subarray(0, 12)); cipher.setAuthTag(b.subarray(-16)); return Buffer.concat([cipher.update(b.subarray(12, -16)), cipher.final()]); }
export async function application(userId: string): Promise<DriverApplication | null> { const row = (await db.prepare('SELECT * FROM driver_applications WHERE user_id=?').get(userId)) as {
    status: DriverApplication['status'];
    personal: Uint8Array | null;
    reason: string | null;
    submitted_at: string | null;
} | undefined; if (!row)
    return null; return { userId, status: row.status, personal: row.personal ? JSON.parse(decrypt(row.personal).toString('utf8')) as DriverPersonal : null, reason: row.reason, submittedAt: row.submitted_at, documents: (await db.prepare('SELECT id,kind,uploaded_at AS uploadedAt FROM driver_documents WHERE user_id=?').all(userId)) as {
        id: string;
        kind: DocumentKind;
        uploadedAt: string;
    }[] }; }
export async function driverApproved(user: Session) { return user.role !== 'driver' || await isAdminDriver(user) || (user.id === 'demo-driver' && demoLoginEnabled) || ((await db.prepare('SELECT status FROM driver_applications WHERE user_id=?').get(user.id)) as {
    status: string;
} | undefined)?.status === 'APPROVED'; }
