import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireUser,requireOrigin,rateLimit,AuthError} from '@/lib/server/auth-store';
import '@/lib/server/job-board-store';
import {commissionSummary,updateCommission} from '@/lib/server/board-commission';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){return handle(req);}
export async function POST(req:NextRequest){return handle(req);}
async function handle(req:NextRequest){try{
 const user=await requireUser(req);await rateLimit('commission:'+user.id,60,60000);
 let result;
 if(req.method==='POST'){requireOrigin(req);const text=await req.text();if(text.length>2000)throw new AuthError(413,'ข้อมูลยาวเกินไป');let body;try{body=JSON.parse(text);}catch{throw new AuthError(400,'ข้อมูลไม่ถูกต้อง');}result=await updateCommission(user,body);}
 else result=await commissionSummary(user);
 return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof AuthError?e.message:e instanceof z.ZodError?'กรุณาตรวจข้อมูล':'ระบบขัดข้อง'},{status:e instanceof AuthError?e.status:e instanceof z.ZodError?400:500,headers:{'Cache-Control':'private, no-store'}});}}
