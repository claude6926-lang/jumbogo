import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, requireOrigin, rateLimit, AuthError } from '@/lib/server/auth-store';
import { mapsConfigured, searchPlaces, computeRoute } from '@/lib/server/maps';
import { getJob } from '@/lib/server/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handler(req: NextRequest, ctx: {
    params: Promise<{
        path: string[];
    }>;
}) {
    try {
        const user = (await requireUser(req)), { path } = await ctx.params;
        let result: unknown;
        if (req.method === 'GET' && path[0] === 'config')
            result = { configured: mapsConfigured(), browserKey: process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() || '' };
        else if (req.method === 'POST' && path[0] === 'autocomplete') {
            requireOrigin(req);
            await rateLimit('maps-autocomplete:' + user.id, 30, 60000);
            z.object({input:z.string().trim().min(3).max(300)}).parse(await req.json());
            if(!mapsConfigured())throw new AuthError(503,'MAP_PROVIDER_NOT_CONFIGURED');
            result={allowed:true};
        }
        else if (req.method === 'POST' && path[0] === 'search') {
            requireOrigin(req);
            (await rateLimit('maps-search:' + user.id, 30, 60000));
            const { address } = z.object({ address: z.string().trim().min(3).max(300) }).parse(await req.json());
            result = { places: await searchPlaces(address) };
        }
        else if (req.method === 'GET' && path[0] === 'job' && path.length === 2) {
            (await rateLimit('maps-route:' + user.id, 12, 60000));
            const job = (await getJob(path[1]));
            if (!job)
                throw new AuthError(404, 'NOT_FOUND');
            if (user.role !== 'admin' && job.userId !== user.id && job.driverId !== user.id)
                throw new AuthError(403, 'FORBIDDEN');
            if (!job.locations)
                throw new AuthError(409, 'LEGACY_JOB_NO_ROUTE');
            result = await computeRoute(job.locations.map((p, i) => ({ ...p, address: [job.pickup, ...job.drops][i] })));
        }
        else
            throw new AuthError(404, 'NOT_FOUND');
        return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (e) {
        return NextResponse.json({ error: e instanceof AuthError ? e.message : e instanceof z.ZodError ? 'VALIDATION_ERROR' : 'MAP_PROVIDER_UNAVAILABLE' }, { status: e instanceof AuthError ? e.status : e instanceof z.ZodError ? 400 : 502 });
    }
}
export const GET = handler;
export const POST = handler;
