import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {switchAdminRole,requireOrigin,rateLimit,AuthError,currentUser} from '@/lib/server/auth-store';
export const runtime='nodejs';
export async function GET(req:NextRequest){const user=await currentUser(req);return NextResponse.json({admin:!!user?.adminAccount,role:user?.businessAccount?'business':user?.role},{headers:{'Cache-Control':'private, no-store'}});}
export async function POST(req:NextRequest){try{requireOrigin(req);const token=req.cookies.get('jumbo_session')?.value||'guest';await rateLimit('admin-role:'+token,20,60000);const p=z.object({role:z.enum(['admin','user','driver','business'])}).parse(await req.json());return await switchAdminRole(req,p.role);}catch(e){return NextResponse.json({error:e instanceof AuthError?e.message:'ข้อมูลไม่ถูกต้อง'},{status:e instanceof AuthError?e.status:400});}}
