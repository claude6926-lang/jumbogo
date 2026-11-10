import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {premiumWebhook} from '@/lib/server/premium-payments';
import {beamFinance} from '@/lib/server/beam-finance';
import {beamList,createBeam,refreshBeam,beamWebhook,beamReceipt} from '@/lib/server/beam-wallet';
import { AuthError, requireUser, requireOrigin, rateLimit } from '@/lib/server/auth-store';
import { paymentList, createPayment, refreshPayment, simulatePayment, simulateXendit, xenditWebhook, receipt, webhook } from '@/lib/server/wallet-payments';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function read(req: NextRequest, raw=false) { const reader = req.body?.getReader(); if (!reader)
    throw new AuthError(400, 'EMPTY_BODY'); let size = 0; const chunks: Uint8Array[] = []; while (true) {
    const v = await reader.read();
    if (v.done)
        break;
    size += v.value.length;
    if (size > 16000) {
        await reader.cancel();
        throw new AuthError(413, 'BODY_TOO_LARGE');
    }
    chunks.push(v.value);
} try {
    return raw ? Buffer.concat(chunks) : JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
catch {
    throw new AuthError(400, 'INVALID_JSON');
} }
async function handler(req: NextRequest, ctx: {
    params: Promise<{
        path: string[];
    }>;
}) {
    try {
        const { path } = await ctx.params;
        const route = path.join('/');
        const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
        if(route==='beam/webhook'&&req.method==='POST'){
            const raw=await read(req,true);const signature=req.headers.get('x-beam-signature');
            await premiumWebhook(raw,signature);
            await beamWebhook(raw,signature);
            return NextResponse.json({ok:true},{headers});
        }
        if (route === 'xendit/webhook' && req.method === 'POST') {
            await xenditWebhook(await read(req), req.headers.get('x-callback-token'));
            return NextResponse.json({ ok: true }, { headers });
        }
        if (route === 'webhook' && req.method === 'POST') {
            await webhook(await read(req));
            return NextResponse.json({ ok: true }, { headers });
        }
        const user = (await requireUser(req));
        if(route==='beam/finance'&&req.method==='GET'){if(user.role!=='admin')throw new AuthError(403,'FORBIDDEN');await rateLimit('beam-finance:'+user.id,20,60000);return NextResponse.json(await beamFinance(user),{headers});}
        let data: unknown;
        if(route==='beam/list'&&req.method==='GET')return NextResponse.json(await beamList(user),{headers});
        if(path[0]==='beam'&&path[1]==='receipt'&&path.length===3&&req.method==='GET')return NextResponse.json(await beamReceipt(user,z.string().uuid().parse(path[2])),{headers});
        if(path[0]==='beam'&&req.method==='POST'){
            requireOrigin(req);await rateLimit('beam-wallet:'+user.id,20,60000);
            if(route==='beam/create')data=await createBeam(user,await read(req));
            else if(path[1]==='refresh'&&path.length===3)data=await refreshBeam(user,z.string().uuid().parse(path[2]));
            else throw new AuthError(404,'NOT_FOUND');
            return NextResponse.json(data,{headers});
        }
        if (req.method === 'GET' && route === 'list')
            data = (await paymentList(user));
        else if (req.method === 'GET' && path[0] === 'receipt' && path.length === 2)
            return NextResponse.json((await receipt(user, path[1])), { headers: { ...headers, 'Content-Disposition': `attachment; filename="payment-${z.string().uuid().parse(path[1])}.json"` } });
        else if (req.method === 'POST') {
            requireOrigin(req);
            (await rateLimit(`wallet-payments:${user.id}`, 60, 60000));
            if (route === 'xendit/simulate')
                data = await simulateXendit(user, await read(req));
            else if (route === 'create')
                data = await createPayment(user, await read(req));
            else if (route === 'simulate')
                data = (await simulatePayment(user, await read(req)));
            else if (path[0] === 'refresh' && path.length === 2)
                data = await refreshPayment(user, z.string().uuid().parse(path[1]));
            else
                throw new AuthError(404, 'NOT_FOUND');
        }
        else
            throw new AuthError(404, 'NOT_FOUND');
        return NextResponse.json(data, { headers });
    }
    catch (e) {
        return NextResponse.json({ error: e instanceof AuthError ? e.message : e instanceof z.ZodError ? 'VALIDATION_ERROR' : 'PAYMENT_PROVIDER_ERROR' }, { status: e instanceof AuthError ? e.status : e instanceof z.ZodError ? 400 : 502 });
    }
}
export const GET = handler;
export const POST = handler;
