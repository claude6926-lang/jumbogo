import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {NextRequest,NextResponse} from 'next/server';
import {requireUser,requireOrigin,AuthError,rateLimit} from '@/lib/server/auth-store';
import {db,audit,transaction} from '@/lib/server/db';
import '@/lib/server/cms-store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){try{
 const user=await requireUser(req);if(user.role!=='admin')throw new AuthError(403,'FORBIDDEN');requireOrigin(req);await rateLimit('cms-media:'+user.id,20,60000);
 if(Number(req.headers.get('content-length')||0)>3500000)throw new AuthError(413,'IMAGE_TOO_LARGE');
 const form=await req.formData(),file=form.get('file');if(!(file instanceof File)||file.size>3000000||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new AuthError(400,'INVALID_IMAGE');
 const image=sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:25000000});const meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format||''))throw new AuthError(400,'INVALID_IMAGE');
 const bytes=await image.rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();if(bytes.length>2000000)throw new AuthError(413,'IMAGE_TOO_LARGE');
 const id=randomUUID();await transaction(async()=>{await db.prepare('INSERT INTO cms_media VALUES(?,?,?,?)').run(id,bytes,user.id,new Date().toISOString());await audit(user.id,'CMS_MEDIA_UPLOAD',{id,size:bytes.length});});
 return NextResponse.json({url:'/api/content/media?id='+id},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof AuthError?e.message:'INVALID_IMAGE'},{status:e instanceof AuthError?e.status:400});}}
export async function GET(req:NextRequest){const id=req.nextUrl.searchParams.get('id');if(!id||! /^[0-9a-f-]{36}$/.test(id))return new NextResponse(null,{status:404});const row=await db.prepare('SELECT bytes FROM cms_media WHERE id=?').get(id);if(!row)return new NextResponse(null,{status:404});return new NextResponse(new Uint8Array(row.bytes as Uint8Array),{headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});}
