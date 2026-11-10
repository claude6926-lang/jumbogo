import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError,currentUser,requireUser,requireOrigin,rateLimit } from '@/lib/server/auth-store';
import { boardDetail,boardList,boardOffers,canPostBoard,saveBoard,acceptBoard,offerBoard,boardStatus } from '@/lib/server/job-board-store';
import {companyInfo} from '@/lib/server/company-store';
import {getCustomerDetails} from '@/lib/server/customer-details';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function body(req:NextRequest) {
 const reader=req.body?.getReader();if(!reader)throw new AuthError(400,'ข้อมูลไม่ครบ');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32000){await reader.cancel();throw new AuthError(413,'ข้อความยาวเกินไป');}chunks.push(part.value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AuthError(400,'ข้อมูลไม่ถูกต้อง');}
}
async function handler(req:NextRequest,ctx:{params:Promise<{path?:string[]}>}) {
 try{
  const {path=[]}=await ctx.params;let result:unknown;
  if(req.method==='GET'){
   const user=await currentUser(req);
   if(path.length===0)result={jobs:await boardList(user,req.nextUrl.searchParams),user:user?{id:user.id,role:user.role}:null,canPost:await canPostBoard(user)};
   else if(path.length===1){const id=z.string().uuid().parse(path[0]);result={job:await boardDetail(id,user),offers:await boardOffers(id,user),user:user?{id:user.id,role:user.role}:null,canPost:await canPostBoard(user)};}
   else throw new AuthError(404,'ไม่พบหน้า');
  }else{
   const user=await requireUser(req);requireOrigin(req);await rateLimit('board-write:'+user.id,60,60000);
   if(!path.length&&req.method==='POST'){await rateLimit('board-post:'+user.id,10,3600000);result=await saveBoard(user,await body(req));}
   else{
    const id=z.string().uuid().parse(path[0]);
    if(path.length===1&&req.method==='PATCH')result=await saveBoard(user,await body(req),id);
    else if(req.method==='POST'&&path.length===2){
     if(path[1]==='accept'){await rateLimit('board-accept:'+user.id,20,60000);const p=z.object({driver_id:z.string().min(1).max(100).optional()}).parse(await body(req));result=await acceptBoard(user,id,p.driver_id);}
     else if(path[1]==='offers')result=await offerBoard(user,id,await body(req));
     else if(path[1]==='status'){const p=z.object({status:z.enum(['cancelled','in_progress','done'])}).parse(await body(req));result=await boardStatus(user,id,p.status);}
     else throw new AuthError(404,'ไม่พบหน้า');
    }else throw new AuthError(404,'ไม่พบหน้า');
   }
  }
  if(req.method==='GET'&&result&&typeof result==='object'&&'canPost' in result&&result.canPost){const user=await requireUser(req);const isCompany=user.role==='admin'||!!user.businessAccount||(await getCustomerDetails(user.id))?.customerType==='business';result={...result,isCompany,...(isCompany?{company:await companyInfo(user)}:{})};}
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof AuthError?e.message:e instanceof z.ZodError?'กรุณาตรวจข้อมูลที่กรอก':'ระบบขัดข้อง กรุณาลองใหม่'},{status:e instanceof AuthError?e.status:e instanceof z.ZodError?400:500,headers:{'Cache-Control':'private, no-store'}});}
}
export const GET=handler;export const POST=handler;export const PATCH=handler;
