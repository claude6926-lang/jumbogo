import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { accountSchema, registerSchema, loginSchema, normalizePhone, personalSchema, documentKinds } from '@/lib/auth-domain';
import { db, audit, transaction } from '@/lib/server/db';
import { application, AuthError, checkPassword, createAccount, currentUser, decrypt, encrypt, hashPassword, issueSession, rateLimit, requireOrigin, requireUser } from '@/lib/server/auth-store';
import { oauthCallback, oauthStart, providerAvailability } from '@/lib/server/oauth';
import { getCustomerDetails, saveCustomerDetails } from '@/lib/server/customer-details';
import { recoveryMode, requestPasswordReset, resetPassword } from '@/lib/server/password-reset';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function boundedBody(req: NextRequest, limit: number) { if (Number(req.headers.get('content-length')) > limit)
    throw new AuthError(413, 'FILE_TOO_LARGE'); const reader = req.body?.getReader(); if (!reader)
    throw new AuthError(400, 'VALIDATION_ERROR'); const chunks: Uint8Array[] = []; let size = 0; while (true) {
    const { value, done } = await reader.read();
    if (done)
        break;
    size += value.length;
    if (size > limit) {
        await reader.cancel();
        throw new AuthError(413, 'FILE_TOO_LARGE');
    }
    chunks.push(value);
} return Buffer.concat(chunks); }
async function json(req: NextRequest) { try {
    return JSON.parse((await boundedBody(req, 16000)).toString('utf8'));
}
catch (e) {
    if (e instanceof AuthError)
        throw e;
    throw new AuthError(400, 'VALIDATION_ERROR');
} }
async function handler(req: NextRequest, ctx: {
    params: Promise<{
        path: string[];
    }>;
}) {
    try {
        const { path } = await ctx.params;
        const route = path.join('/');
        if (req.method === 'POST')
            requireOrigin(req);
        if (route === 'recovery' && req.method === 'GET')
            return NextResponse.json({ delivery: recoveryMode() }, { headers: { 'Cache-Control': 'no-store' } });
        if (route === 'forgot-password' && req.method === 'POST')
            return NextResponse.json(await requestPasswordReset(await json(req)), { headers: { 'Cache-Control': 'no-store' } });
        if (route === 'reset-password' && req.method === 'POST') {
            const response = NextResponse.json(await resetPassword(await json(req)), { headers: { 'Cache-Control': 'no-store' } });
            response.cookies.delete('jumbo_session');
            return response;
        }
        if (route === 'providers' && req.method === 'GET')
            return NextResponse.json(providerAvailability());
        if (path[0] === 'oauth' && req.method === 'GET')
            return path[2] === 'callback' ? await oauthCallback(req, path[1]) : await oauthStart(req, path[1]);
        if (route === 'register' && req.method === 'POST') {
            (await rateLimit('register-global', 100, 3600000));
            const input = registerSchema.parse(await json(req));
            const hash = await hashPassword(input.password);
            const id = (await createAccount(input, hash, undefined, input.role === 'user' && input.customerDetails ? async (userId) => (await saveCustomerDetails(userId, input.customerDetails!)) : undefined));
            return (await issueSession(req, id, NextResponse.json({ next: input.role === 'driver' ? '/driver/verification' : '/user/home' }, { status: 201 })));
        }
        if (route === 'login' && req.method === 'POST') {
            const input = loginSchema.parse(await json(req));
            const identifier = input.identifier.includes('@') ? input.identifier.toLowerCase() : normalizePhone(input.identifier);
            (await rateLimit(`login:${input.role}:${identifier}`));
            (await rateLimit('login-global', 200, 60000));
            const row = (await db.prepare("SELECT user_id,password_hash,role FROM accounts WHERE (role=? OR (?='user' AND role='admin')) AND (email=? OR phone=?) ORDER BY role DESC LIMIT 1").get(input.role, input.role, identifier, identifier)) as {
                user_id: string;
                password_hash: string | null;
                role: string;
            } | undefined;
            if (!await checkPassword(input.password, row?.password_hash))
                throw new AuthError(401, 'INVALID_CREDENTIALS');
            (await audit(row!.user_id, 'LOGIN', { method: 'password' }));
            return (await issueSession(req, row!.user_id, NextResponse.json({ next: row!.role === 'admin' ? '/admin' : input.role === 'driver' ? '/driver/home' : '/user/home' })));
        }
        if (route === 'pending' && req.method === 'GET') {
            const pending = (await db.prepare('SELECT name,email,role FROM oauth_pending WHERE id=? AND expires>?').get(req.cookies.get('jumbo_pending')?.value || '', Date.now()));
            if (!pending)
                throw new AuthError(401, 'SOCIAL_EXPIRED');
            return NextResponse.json(pending);
        }
        if (route === 'complete' && req.method === 'POST') {
            const input = accountSchema.parse(await json(req));
            const token = req.cookies.get('jumbo_pending')?.value || '';
            const id = (await transaction(async () => { const pending = (await db.prepare('SELECT provider,subject,role FROM oauth_pending WHERE id=? AND expires>?').get(token, Date.now())) as {
                provider: string;
                subject: string;
                role: string;
            } | undefined; if (!pending || pending.role !== input.role)
                throw new AuthError(401, 'SOCIAL_EXPIRED'); return pending; }));
            // Account creation and one-time pending consumption share one transaction below.
            const userId = (await createAccount(input, null, { ...id, pendingToken: token }));
            const response = (await issueSession(req, userId, NextResponse.json({ next: input.role === 'driver' ? '/driver/verification' : '/user/home' })));
            response.cookies.delete('jumbo_pending');
            return response;
        }
        if (route === 'logout' && req.method === 'POST') {
            const user = (await currentUser(req));
            if (user) {
                (await db.prepare('DELETE FROM sessions WHERE token=?').run(req.cookies.get('jumbo_session')!.value));
                (await audit(user.id, 'LOGOUT', {}));
            }
            const response = NextResponse.json({ ok: true });
            response.cookies.delete('jumbo_session');
            return response;
        }
        const user = (await requireUser(req));
        if (route === 'customer-details' && req.method === 'GET') {
            if (user.role !== 'user')
                throw new AuthError(403, 'FORBIDDEN');
            return NextResponse.json((await getCustomerDetails(user.id)), { headers: { 'Cache-Control': 'private, no-store' } });
        }
        if (route === 'application' && req.method === 'GET') {
            if (user.role !== 'driver')
                throw new AuthError(403, 'FORBIDDEN');
            return NextResponse.json((await application(user.id)));
        }
        if (path[0] === 'application' && path[1] === 'document' && req.method === 'POST') {
            if(user.role!=='driver')throw new AuthError(403,'FORBIDDEN');
            const kind=z.enum(documentKinds).parse(path[2]);
            await rateLimit(`upload:${user.id}`,40,3600000);
            const contentType=req.headers.get('content-type')||'';
            if(!contentType.startsWith('multipart/form-data;'))throw new AuthError(400,'VALIDATION_ERROR');
            const body=await boundedBody(req,4*1024*1024);
            const form=await new Request(req.url,{method:'POST',headers:{'content-type':contentType},body:new Uint8Array(body)}).formData();
            if(form.get('documentConsent')!=='true')throw new AuthError(400,'VALIDATION_ERROR');
            const file=form.get('image');
            if(!(file instanceof File)||!file.size)throw new AuthError(400,'IMAGE_ONLY');
            if(file.size>3*1024*1024)throw new AuthError(413,'FILE_TOO_LARGE');
            if(!['image/jpeg','image/png'].includes(file.type))throw new AuthError(400,'IMAGE_ONLY');
            let clean:Buffer;
            try{
                const image=sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:20000000,failOn:'warning'});
                if(!['jpeg','png'].includes((await image.metadata()).format||''))throw new Error();
                clean=await image.rotate().resize({width:3000,height:3000,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
            }catch{throw new AuthError(400,'INVALID_IMAGE');}
            const encrypted=encrypt(clean);
            await transaction(async()=>{
                const current=await application(user.id);
                if(!current||!['DRAFT','REJECTED'].includes(current.status))throw new AuthError(409,'APPLICATION_LOCKED');
                await db.prepare('INSERT INTO driver_documents VALUES(?,?,?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET encrypted=excluded.encrypted,uploaded_at=excluded.uploaded_at').run(randomUUID(),user.id,kind,encrypted,new Date().toISOString());
                await audit(user.id,'DRIVER_DOCUMENT_UPLOADED',{kind});
            });
            return NextResponse.json({ok:true});
        }
        if (route === 'application' && req.method === 'POST') {
            if (user.role !== 'driver')
                throw new AuthError(403, 'FORBIDDEN');
            (await rateLimit(`upload:${user.id}`, 20, 3600000));
            if (!req.headers.get('content-type')?.startsWith('multipart/form-data;'))
                throw new AuthError(400, 'VALIDATION_ERROR');
            const body = await boundedBody(req, 42 * 1024 * 1024);
            const form = await new Request(req.url, { method: 'POST', headers: { 'content-type': req.headers.get('content-type') || '' }, body: new Uint8Array(body) }).formData();
            const personal = personalSchema.parse(JSON.parse(String(form.get('personal') || '{}')));
            const prepared: {
                kind: string;
                data: Buffer;
            }[] = [];
            if (form.get('documentConsent') !== 'true')
                throw new AuthError(400, 'VALIDATION_ERROR');
            for (const kind of documentKinds) {
                const file = form.get(kind);
                if (file instanceof File && file.size) {
                    if (file.size > 5 * 1024 * 1024)
                        throw new AuthError(413, 'FILE_TOO_LARGE');
                    if (!['image/jpeg', 'image/png'].includes(file.type))
                        throw new AuthError(400, 'IMAGE_ONLY');
                    const bytes = Buffer.from(await file.arrayBuffer());
                    let clean: Buffer;
                    try {
                        const source = sharp(bytes, { limitInputPixels: 20000000, failOn: 'warning' });
                        const metadata = await source.metadata();
                        if (!['jpeg', 'png'].includes(metadata.format || ''))
                            throw new Error('Invalid format');
                        clean = await source.rotate().resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
                    }
                    catch {
                        throw new AuthError(400, 'INVALID_IMAGE');
                    }
                    prepared.push({ kind, data: encrypt(clean) });
                }
            }
            const encryptedPersonal = encrypt(Buffer.from(JSON.stringify(personal)));
            (await transaction(async () => { const current = (await application(user.id)); if (!current || !['DRAFT', 'REJECTED'].includes(current.status))
                throw new AuthError(409, 'APPLICATION_LOCKED'); const existing = new Set(current.documents.map(d => d.kind)); for (const kind of documentKinds)
                if (!existing.has(kind) && !prepared.some(d => d.kind === kind))
                    throw new AuthError(400, 'DOCUMENTS_REQUIRED'); const at = new Date().toISOString(); for (const file of prepared)
                (await db.prepare('INSERT INTO driver_documents VALUES(?,?,?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET encrypted=excluded.encrypted,uploaded_at=excluded.uploaded_at').run(randomUUID(), user.id, file.kind, file.data, at)); (await db.prepare("UPDATE driver_applications SET status='PENDING',personal=?,reason=NULL,submitted_at=?,updated_at=? WHERE user_id=?").run(encryptedPersonal, at, at, user.id)); (await db.prepare('INSERT INTO consents VALUES(?,?,?,?)').run(randomUUID(), user.id, 'driver-documents-2026-09-25', at)); (await audit(user.id, 'DRIVER_APPLICATION_SUBMITTED', { documentCount: 8 })); }));
            return NextResponse.json({ ok: true, status: 'PENDING' });
        }
        if (path[0] === 'document' && req.method === 'GET') {
            const doc = (await db.prepare('SELECT * FROM driver_documents WHERE id=?').get(path[1])) as {
                user_id: string;
                kind: string;
                encrypted: Uint8Array;
            } | undefined;
            if (!doc)
                throw new AuthError(404, 'NOT_FOUND');
            if (user.role !== 'admin' && user.id !== doc.user_id)
                throw new AuthError(403, 'FORBIDDEN');
            (await audit(user.id, 'DRIVER_DOCUMENT_VIEWED', { documentId: path[1] }));
            return new NextResponse(new Uint8Array(decrypt(doc.encrypted)), { headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': `inline; filename="${doc.kind}.jpg"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
        }
        if (route === 'admin/applications' && req.method === 'GET') {
            if (user.role !== 'admin')
                throw new AuthError(403, 'FORBIDDEN');
            const rows = (await db.prepare("SELECT u.id,u.name,u.phone,a.status,a.submitted_at FROM driver_applications a JOIN users u ON u.id=a.user_id WHERE a.status!='DRAFT' ORDER BY a.updated_at DESC").all()) as {
                id: string;
            }[];
            return NextResponse.json((await Promise.all(rows.map(async (row) => ({ ...row, ...(await application(row.id)) })))));
        }
        if (path[0] === 'admin' && path[1] === 'applications' && path[2] && req.method === 'POST') {
            if (user.role !== 'admin')
                throw new AuthError(403, 'FORBIDDEN');
            const input = z.object({ status: z.enum(['APPROVED', 'REJECTED']), reason: z.string().trim().max(500) }).parse(await json(req));
            if (input.status === 'REJECTED' && input.reason.length < 3)
                throw new AuthError(400, 'REASON_REQUIRED');
            (await transaction(async () => { const app = (await application(path[2])); if (app?.status !== 'PENDING' || !app.personal || app.documents.length !== 8)
                throw new AuthError(409, 'APPLICATION_LOCKED'); (await db.prepare('UPDATE driver_applications SET status=?,reason=?,updated_at=? WHERE user_id=?').run(input.status, input.reason, new Date().toISOString(), path[2])); (await audit(user.id, 'DRIVER_APPLICATION_REVIEWED', { userId: path[2], status: input.status, reason: input.reason })); }));
            return NextResponse.json({ ok: true });
        }
        throw new AuthError(404, 'NOT_FOUND');
    }
    catch (e) {
        if (e instanceof AuthError)
            return NextResponse.json({ error: e.message }, { status: e.status });
        if (e instanceof z.ZodError || e instanceof SyntaxError)
            return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
        console.error('Auth operation failed', e instanceof Error ? e.name : 'Unknown');
        return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
export const GET = handler;
export const POST = handler;
