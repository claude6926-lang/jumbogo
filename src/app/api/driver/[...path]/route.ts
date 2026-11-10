import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { AuthError, requireUser, requireOrigin, rateLimit } from '@/lib/server/auth-store';
import { dashboard, jobOperations, proofImage, saveProof, updateLocation, updateWork, updatePayPolicy, settleJob, requestWithdrawal, reviewWithdrawal } from '@/lib/server/driver-store';
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
async function handler(req: NextRequest, ctx: {
    params: Promise<{
        path: string[];
    }>;
}) {
    try {
        const user = (await requireUser(req));
        const { path } = await ctx.params;
        const route = path.join('/');
        if (req.method === 'POST') {
            requireOrigin(req);
            (await rateLimit('driver-ops:' + user.id, 150, 60000));
        }
        let result: unknown = { ok: true };
        if(req.method==='GET'&&path[0]==='job')await rateLimit('tracking-read:'+user.id,60,60000);
        if(req.method==='POST'&&path[0]==='location')await rateLimit('tracking-write:'+user.id,20,60000);
        if (req.method === 'GET') {
            if (route === 'dashboard')
                result = (await dashboard(user));
            else if (path[0] === 'job' && path.length === 2)
                result = (await jobOperations(user, path[1]));
            else if (path[0] === 'proof' && path.length === 2)
                return new NextResponse(new Uint8Array((await proofImage(user, path[1]))), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
            else
                throw new AuthError(404, 'NOT_FOUND');
        }
        else if (route === 'work')
            (await updateWork(user, await req.json()));
        else if (route === 'policy')
            (await updatePayPolicy(user, await req.json()));
        else if (route === 'settle')
            (await settleJob(user, await req.json()));
        else if (route === 'withdraw')
            result = { id: (await requestWithdrawal(user, await req.json())) };
        else if (route === 'review')
            (await reviewWithdrawal(user, await req.json()));
        else if (path[0] === 'location' && path.length === 2)
            (await updateLocation(user, path[1], await req.json()));
        else if (path[0] === 'proof' && path.length === 2) {
            if (!req.headers.get('content-type')?.startsWith('multipart/form-data;'))
                throw new AuthError(400, 'VALIDATION_ERROR');
            const bytes = await boundedBody(req, 9 * 1024 * 1024);
            const form = await new Request(req.url, { method: 'POST', headers: { 'content-type': req.headers.get('content-type')! }, body: new Uint8Array(bytes) }).formData();
            const file = form.get('image');
            if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024)
                throw new AuthError(400, 'INVALID_IMAGE');
            let image: Buffer;
            try {
                image = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 24000000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
            }
            catch {
                throw new AuthError(400, 'INVALID_IMAGE');
            }
            (await saveProof(user, path[1], { recipient: form.get('recipient'), note: form.get('note') || '' }, image));
        }
        else
            throw new AuthError(404, 'NOT_FOUND');
        return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (e) {
        const status = e instanceof AuthError ? e.status : e instanceof z.ZodError ? 400 : 500;
        return NextResponse.json({ error: e instanceof AuthError ? e.message : e instanceof z.ZodError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR' }, { status });
    }
}
export const GET = handler;
export const POST = handler;
