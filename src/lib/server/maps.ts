import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthError, rateLimit } from './auth-store';
import { calculateFare,addBookingExtras, type BookingInput, type Fare, type Vehicle } from '../domain';
import {bookingExtraRates} from './booking-extras';
import { coordinateSchema, type RoutePoint, type RoutePreview } from '../maps';
import {db} from './db';
type Quote = {
    userId: string;
    fingerprint: string;
    fare: Fare;
    route: RoutePreview;
    expires: number;
};
await db.migrate('CREATE TABLE IF NOT EXISTS map_quotes(id TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS map_quotes_expiry ON map_quotes(expires)');
await db.migrate('CREATE TABLE IF NOT EXISTS map_routes(id TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS map_routes_expiry ON map_routes(expires)');
const pendingRoutes = new Map<string, Promise<RoutePreview>>();
export function mapsConfigured() { return !!process.env.GOOGLE_MAPS_SERVER_KEY?.trim() && !!process.env.GOOGLE_MAPS_BROWSER_KEY?.trim(); }
function requireMaps() { if (!mapsConfigured())
    throw new AuthError(503, 'MAP_PROVIDER_NOT_CONFIGURED'); }
async function googleJson(url: string, options: RequestInit = {}) {
    try {
        const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(12000) });
        if (!response.ok) {
            const body=await response.json().catch(()=>null);
            const known=new Set(['API_KEY_INVALID','API_KEY_EXPIRED','API_KEY_SERVICE_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_IP_ADDRESS_BLOCKED','SERVICE_DISABLED','BILLING_DISABLED','RATE_LIMIT_EXCEEDED','QUOTA_EXCEEDED']);
            const reason=body?.error?.details?.find((detail:{reason?:string})=>known.has(detail.reason||''))?.reason;
            // Never log the URL, request headers, provider message or key metadata.
            throw new AuthError(502,reason?'MAP_'+reason:response.status===429?'MAP_QUOTA_EXCEEDED':response.status===403?'MAP_ACCESS_DENIED':'MAP_PROVIDER_UNAVAILABLE');
        }
        return await response.json();
    }
    catch (error) {
        if(error instanceof AuthError)throw error;
        throw new AuthError(502, 'MAP_PROVIDER_UNAVAILABLE');
    }
}
export async function searchPlaces(address: string): Promise<RoutePoint[]> {
    requireMaps();
    const params = new URLSearchParams({ address, region: 'th', language: 'th', key: process.env.GOOGLE_MAPS_SERVER_KEY!.trim() });
    const data = await googleJson('https://maps.googleapis.com/maps/api/geocode/json?' + params);
    if (data.status === 'ZERO_RESULTS')
        return [];
    if (data.status !== 'OK')
        throw new AuthError(502, 'MAP_PROVIDER_UNAVAILABLE');
    return z.array(z.object({ formatted_address: z.string(), place_id: z.string(), geometry: z.object({ location: coordinateSchema }) })).parse(data.results).slice(0, 5).map(p => ({ ...p.geometry.location, address: p.formatted_address, placeId: p.place_id }));
}
export async function computeRoute(points: RoutePoint[]): Promise<RoutePreview> {
    requireMaps();
    const coordinates = z.array(coordinateSchema).min(2).max(27).parse(points);
    const id = createHash('sha256').update(JSON.stringify(['DRIVE','TRAFFIC_UNAWARE',coordinates])).digest('hex');
    const cached = await db.prepare('SELECT data FROM map_routes WHERE id=? AND expires>?').get(id,Date.now());
    if(cached)return {...JSON.parse(String(cached.data)),points};
    const existing = pendingRoutes.get(id);
    if(existing)return {...await existing,points};
    const request = fetchRoute(points).then(async route=>{
        const expires=Date.now()+600000;
        await db.prepare('DELETE FROM map_routes WHERE expires<=?').run(Date.now());
        await db.prepare('INSERT INTO map_routes VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,expires=excluded.expires').run(id,JSON.stringify({...route,points:coordinates}),expires);
        return route;
    }).finally(()=>pendingRoutes.delete(id));
    pendingRoutes.set(id,request);
    return request;
}
async function fetchRoute(points: RoutePoint[]): Promise<RoutePreview> {
    const waypoint = (p: RoutePoint) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const data = await googleJson('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_SERVER_KEY!.trim(), 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' }, body: JSON.stringify({ origin: waypoint(points[0]), destination: waypoint(points.at(-1)!), intermediates: points.slice(1, -1).map(waypoint), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', languageCode: 'th', units: 'METRIC' }) });
    if (!data.routes?.length)
        throw new AuthError(422, 'ROUTE_NOT_FOUND');
    const r = z.object({ distanceMeters: z.number().nonnegative().max(10000000), duration: z.string().regex(/^\d+(\.\d+)?s$/), polyline: z.object({ encodedPolyline: z.string().min(1).max(200000) }) }).parse(data.routes[0]);
    return { points, distanceMeters: r.distanceMeters, durationSeconds: Number(r.duration.slice(0, -1)), polyline: r.polyline.encodedPolyline };
}
function fingerprint(input: BookingInput) { return JSON.stringify([input.pickup, input.drops, input.locations, input.vehicle, input.helper, input.scheduledAt,input.extraHelpers||0,input.pickupStairs||0,input.dropStairs||0]); }
export async function createMapQuote(userId: string, input: BookingInput, vehicle: Vehicle) {
    requireMaps();
    (await rateLimit('maps-quote:' + userId, 20, 60000));
    if (!input.locations || input.locations.length !== input.drops.length + 1)
        throw new AuthError(400, 'SELECT_MAP_LOCATIONS');
    const points = input.locations.map((p, i) => ({ ...p, address: [input.pickup, ...input.drops][i] }));
    const rates=await bookingExtraRates();
    if(((input.pickupStairs||0)+(input.dropStairs||0))>0&&rates.stairs_per_floor===null)throw new AuthError(400,'บริการบันไดยังไม่เปิดใช้งาน');
    const route = await computeRoute(points), fare = addBookingExtras(calculateFare(vehicle, Math.round(route.distanceMeters / 100) / 10, input.helper, input.drops.length),input,rates.stairs_per_floor);
    const now = Date.now();
    await db.prepare('DELETE FROM map_quotes WHERE expires<=?').run(now);
    const quoteId = randomUUID(), expires = now + 10 * 60000;
    await db.prepare('INSERT INTO map_quotes VALUES(?,?,?)').run(quoteId,JSON.stringify({ userId, fingerprint: fingerprint(input), route, fare, expires }),expires);
    return { quoteId, fare, route, expiresAt: new Date(expires).toISOString(), simulated: false };
}
export async function readMapQuote(userId: string, input: BookingInput) {
    const row = input.quoteId ? await db.prepare('SELECT data FROM map_quotes WHERE id=?').get(input.quoteId) : undefined;
    const q:Quote|undefined=row?JSON.parse(String(row.data)):undefined;
    if (!q || q.expires <= Date.now())
        throw new AuthError(409, 'QUOTE_EXPIRED');
    if (q.userId !== userId)
        throw new AuthError(403, 'FORBIDDEN');
    if (q.fingerprint !== fingerprint(input))
        throw new AuthError(409, 'QUOTE_CHANGED');
    return q;
}
