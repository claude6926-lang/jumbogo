import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireUser,requireOrigin,AuthError} from '@/lib/server/auth-store';
import {publishedContent,contentEditor,mutateContent,CmsError} from '@/lib/server/cms-store';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
async function handler(req:NextRequest){try{
 if(req.method==='GET'&&!req.nextUrl.searchParams.has('editor')&&!req.nextUrl.searchParams.has('preview'))return NextResponse.json(await publishedContent(),{headers});
 const user=await requireUser(req);if(user.role!=='admin')throw new AuthError(403,'FORBIDDEN');
 if(req.method==='GET'){const editor=await contentEditor();return NextResponse.json(req.nextUrl.searchParams.has('preview')?{revision:editor.revision,values:editor.values}:editor,{headers});}
 requireOrigin(req);
 if(Number(req.headers.get('content-length')||0)>1500000)throw new CmsError(413,'CONTENT_TOO_LARGE');
 const body=await req.text();if(body.length>1500000)throw new CmsError(413,'CONTENT_TOO_LARGE');
 const input=z.object({action:z.enum(['save','publish','restore']),revision:z.number().int().nonnegative(),values:z.record(z.string()).optional(),releaseId:z.number().int().positive().optional()}).strict().parse(JSON.parse(body));
 return NextResponse.json(await mutateContent(user.id,input.action,input.revision,input.values,input.releaseId),{headers});
 }catch(error){const known=error instanceof AuthError||error instanceof CmsError;return NextResponse.json({error:known?error.message:error instanceof z.ZodError||error instanceof SyntaxError?'INVALID_CONTENT':'CMS_UNAVAILABLE'},{status:known?error.status:error instanceof z.ZodError||error instanceof SyntaxError?400:503,headers});}}
export const GET=handler;
export const POST=handler;
