import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { AuthError, requireUser, requireOrigin, rateLimit } from '@/lib/server/auth-store';
import { walletData, walletHistory, walletImage, saveBank, savePolicy, submitTopup, reviewTopup, adjustWallet, assessFee } from '@/lib/server/wallet-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function body(req: NextRequest, limit: number) { const reader = req.body?.getReader(); if (!reader)
    throw new AuthError(400, 'EMPTY_BODY'); const chunks: Uint8Array[] = []; let size = 0; while (true) {
    const { done, value } = await reader.read();
    if (done)
        break;
    size += value.length;
    if (size > limit) {
        await reader.cancel();
        throw new AuthError(413, 'FILE_TOO_LARGE');
    }
    chunks.push(value);
} return Buffer.concat(chunks); }
async function image(file: FormDataEntryValue | null) { if (!(file instanceof File) || !file.size)
    return undefined; if (file.size > 5 * 1024 * 1024)
    throw new AuthError(413, 'FILE_TOO_LARGE'); if (!['image/jpeg', 'image/png'].includes(file.type))
    throw new AuthError(400, 'IMAGE_REQUIRED'); try {
    return await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 20000000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}
catch {
    throw new AuthError(400, 'INVALID_IMAGE');
} }
async function handler(req: NextRequest, ctx: {
    params: Promise<{
        path: string[];
    }>;
}) {
    try {
        const user = (await requireUser(req));
        const { path } = await ctx.params;
        const route = path.join('/');
        const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
        if (req.method === 'GET') {
            if (path[0] === 'history' && path.length === 2)
                return NextResponse.json((await walletHistory(user, path[1])), { headers });
            if (route === 'data')
                return NextResponse.json((await walletData(user)), { headers });
            if (['qr', 'slip'].includes(path[0]) && path.length === 2)
                return new NextResponse(new Uint8Array((await walletImage(user, path[0], path[1]))), { headers: { ...headers, 'Content-Type': 'image/png' } });
        }
        else {
            requireOrigin(req);
            (await rateLimit(`wallet:${user.id}`, 30, 60000));
            if (route !== 'topup' && user.role !== 'admin')
                throw new AuthError(403, 'FORBIDDEN');
            if (route === 'bank' || route === 'topup') {
                const raw = await body(req, 6 * 1024 * 1024);
                const form = await new Response(new Uint8Array(raw), { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData();
                const photo = await image(form.get('image'));
                if (route === 'bank')
                    (await saveBank(user, { id: form.get('id') || undefined, name: form.get('name'), accountName: form.get('accountName'), accountNumber: form.get('accountNumber'), active: form.get('active') === 'true' }, photo));
                else {
                    if (!photo)
                        throw new AuthError(400, 'SLIP_REQUIRED');
                    (await submitTopup(user, { amount: Number(form.get('amount')), bankId: form.get('bankId'), revision: form.get('revision'), idem: form.get('idem') }, photo));
                }
            }
            else {
                let input: unknown;
                try {
                    input = JSON.parse((await body(req, 12000)).toString('utf8'));
                }
                catch (e) {
                    if (e instanceof AuthError)
                        throw e;
                    throw new AuthError(400, 'INVALID_JSON');
                }
                if (route === 'policy')
                    (await savePolicy(user, input));
                else if (route === 'review')
                    (await reviewTopup(user, input));
                else if (route === 'adjust')
                    (await adjustWallet(user, input));
                else if (route === 'fee')
                    (await assessFee(user, input));
                else
                    throw new AuthError(404, 'NOT_FOUND');
            }
            return NextResponse.json({ ok: true }, { headers });
        }
        throw new AuthError(404, 'NOT_FOUND');
    }
    catch (e) {
        const status = e instanceof AuthError ? e.status : e instanceof z.ZodError ? 400 : 500;
        return NextResponse.json({ error: e instanceof AuthError ? e.message : e instanceof z.ZodError ? 'VALIDATION_ERROR' : 'WALLET_ERROR' }, { status });
    }
}
export const GET = handler;
export const POST = handler;
