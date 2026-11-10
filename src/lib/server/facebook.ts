import {createHmac} from 'node:crypto';
import {z} from 'zod';
import {AuthError} from './auth-store';

function settings(){
 const id=process.env.FACEBOOK_APP_ID,secret=process.env.FACEBOOK_APP_SECRET,version=process.env.FACEBOOK_GRAPH_VERSION||'v25.0';
 if(!id||!secret||!/^v\d+\.0$/.test(version))throw new AuthError(503,'OAUTH_NOT_CONFIGURED');
 return {id,secret,version};
}
export function facebookAuthorizationUrl(callback:string,state:string){
 const {id,version}=settings();const url=new URL(`https://www.facebook.com/${version}/dialog/oauth`);
 url.search=new URLSearchParams({client_id:id,redirect_uri:callback,state,response_type:'code',scope:'public_profile,email'}).toString();return url;
}
async function graph(url:URL,init:RequestInit){
 const response=await fetch(url,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok){
  // Log only provider error codes, never the URL, token, code or response message.
  const body=await response.json().catch(()=>null);
  console.error('[facebook-oauth]',{stage:url.pathname.split('/').pop(),status:response.status,code:typeof body?.error?.code==='number'?body.error.code:undefined,subcode:typeof body?.error?.error_subcode==='number'?body.error.error_subcode:undefined});
  throw new AuthError(400,'SOCIAL_FAILED');
 }return response.json();
}
// Web Facebook Login uses a server-side authorization-code exchange, not Google OIDC discovery.
export async function facebookClaims(callback:URL){
 const {id,secret,version}=settings();const code=callback.searchParams.get('code');
 if(!code||callback.searchParams.has('error'))throw new AuthError(400,'SOCIAL_FAILED');
 const redirectUri=new URL(callback);redirectUri.search='';
 const token=z.object({access_token:z.string().min(1)}).parse(await graph(new URL(`https://graph.facebook.com/${version}/oauth/access_token`),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:id,client_secret:secret,redirect_uri:redirectUri.href,code})}));
 const debugUrl=new URL(`https://graph.facebook.com/${version}/debug_token`);debugUrl.searchParams.set('input_token',token.access_token);
 const {data}=z.object({data:z.object({is_valid:z.boolean(),app_id:z.string(),user_id:z.string().min(1),type:z.string(),expires_at:z.number(),data_access_expires_at:z.number().optional()})}).parse(await graph(debugUrl,{headers:{Authorization:`Bearer ${id}|${secret}`}}));
 const now=Math.floor(Date.now()/1000);
 if(!data.is_valid||data.app_id!==id||data.type!=='USER'||data.expires_at<=now||(data.data_access_expires_at!==undefined&&data.data_access_expires_at!==0&&data.data_access_expires_at<=now))throw new AuthError(400,'SOCIAL_FAILED');
 const profileUrl=new URL(`https://graph.facebook.com/${version}/me`);profileUrl.searchParams.set('fields','id,name,email');profileUrl.searchParams.set('appsecret_proof',createHmac('sha256',secret).update(token.access_token).digest('hex'));
 const profile=z.object({id:z.string().min(1),name:z.string().optional(),email:z.string().email().optional()}).parse(await graph(profileUrl,{headers:{Authorization:`Bearer ${token.access_token}`}}));
 if(profile.id!==data.user_id)throw new AuthError(400,'SOCIAL_FAILED');
 return {sub:profile.id,name:profile.name||'',email:profile.email||'',email_verified:false};
}
