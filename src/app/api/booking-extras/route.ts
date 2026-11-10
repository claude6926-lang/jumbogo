import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireUser,requireOrigin,rateLimit,AuthError} from '@/lib/server/auth-store';
import {bookingExtraRates,saveBookingExtraRates} from '@/lib/server/booking-extras';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function handler(req:NextRequest){try{const user=await requireUser(req);await rateLimit('booking-extras:'+user.id,60,60000);if(req.method==='POST'){requireOrigin(req);const text=await req.text();if(text.length>1000)throw new AuthError(413,'ข้อมูลยาวเกินไป');return NextResponse.json(await saveBookingExtraRates(user,JSON.parse(text)),{headers:{'Cache-Control':'private, no-store'}});}return NextResponse.json(await bookingExtraRates(),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof AuthError?e.message:e instanceof z.ZodError?'กรุณาตรวจสอบราคา':'ระบบขัดข้อง'},{status:e instanceof AuthError?e.status:e instanceof z.ZodError?400:500});}}
export const GET=handler;export const POST=handler;
