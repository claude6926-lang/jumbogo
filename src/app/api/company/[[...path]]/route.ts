import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createPremiumPayment,refreshPremiumPayment,latestPremiumPayment} from '@/lib/server/premium-payments';
import {requireUser,requireOrigin,rateLimit,AuthError} from '@/lib/server/auth-store';
import {companyInfo,addDriver,removeDriver,premiumAdmin,updatePremium,respondAssignment,publicPlan,signupInfo,requestPremium,rights,signupRequests} from '@/lib/server/company-store';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function handler(req:NextRequest,ctx:{params:Promise<{path?:string[]}>}){try{
 const {path=[]}=await ctx.params;if(req.method==='GET'&&path.join('/')==='plan')return NextResponse.json(await publicPlan(),{headers:{'Cache-Control':'no-store'}});
 const user=await requireUser(req);await rateLimit('company:'+user.id,60,60000);let result;
 if(path[0]==='payment'){if(req.method==='GET')result=path[1]?await refreshPremiumPayment(user,z.string().uuid().parse(path[1])):await latestPremiumPayment(user);else{requireOrigin(req);await rateLimit('premium-create:'+user.id,5,60000);const text=await req.text();if(text.length>1000)throw new AuthError(413,'ข้อมูลยาวเกินไป');result=await createPremiumPayment(user,JSON.parse(text));}return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});}
 if(req.method==='GET'&&path.join('/')==='subscription')return NextResponse.json(await signupInfo(user),{headers:{'Cache-Control':'private, no-store'}});
 if(req.method==='GET'&&path[0]==='rights'&&path.length===2){if(user.role!=='admin')throw new AuthError(403,'เฉพาะผู้ดูแลระบบ');return NextResponse.json(await rights(path[1]==='default'?undefined:path[1]),{headers:{'Cache-Control':'private, no-store'}});}
 if(req.method==='GET')result=path.join('/')==='admin'?await premiumAdmin(user):!path.length?await companyInfo(user):(()=>{throw new AuthError(404,'ไม่พบหน้า');})();
 else{requireOrigin(req);const text=await req.text();if(text.length>8000)throw new AuthError(413,'ข้อมูลยาวเกินไป');let body;try{body=JSON.parse(text);}catch{throw new AuthError(400,'ข้อมูลไม่ถูกต้อง');}
 if(path.join('/')==='signup')result=await requestPremium(user);
 else if(path.join('/')==='admin')result=await updatePremium(user,body);
 else if(path.join('/')==='drivers')result=await addDriver(user,body);
 else if(path.length===2&&path[0]==='remove-driver')result=await removeDriver(user,z.string().max(100).parse(path[1]));
 else if(path.length===2&&path[0]==='assignment'){const p=z.object({action:z.enum(['assign','decline','public']),driver_id:z.string().max(100).optional()}).parse(body);result=await respondAssignment(user,z.string().uuid().parse(path[1]),p.action,p.driver_id);}
 else throw new AuthError(404,'ไม่พบหน้า');}
 if(req.method==='GET'&&path.join('/')==='admin')result={...result,signupRequests:await signupRequests(user)};
 return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof AuthError?e.message:e instanceof z.ZodError?'กรุณาตรวจข้อมูล':'ระบบขัดข้อง'},{status:e instanceof AuthError?e.status:e instanceof z.ZodError?400:500,headers:{'Cache-Control':'private, no-store'}});}}
export const GET=handler;export const POST=handler;
