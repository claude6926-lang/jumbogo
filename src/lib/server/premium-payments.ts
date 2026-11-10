import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db,transaction,audit} from './db';
import {AuthError} from './auth-store';
import {signupInfo} from './company-store';
import {verifyBeamSignature} from './beam-signature';
import {queuePaymentEmail,deliverPaymentEmail} from './payment-email';
import type {Session} from '../domain';

export const PREMIUM_PRICE=199;
const PERIOD=30*86400000;
await db.migrate(`CREATE TABLE IF NOT EXISTS premium_payments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL CHECK(amount=199),idem TEXT UNIQUE NOT NULL,status TEXT NOT NULL,charge_id TEXT UNIQUE,qr TEXT,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,confirmed_at TEXT);
CREATE INDEX IF NOT EXISTS premium_payment_owner ON premium_payments(user_id,created_at);`);
type Payment={id:string;user_id:string;amount:number;idem:string;status:string;charge_id:string|null;qr:string|null;expires_at:string;created_at:string;confirmed_at:string|null};
function config(){const merchant=process.env.BEAM_MERCHANT_ID?.trim(),key=process.env.BEAM_API_KEY?.trim();if(!merchant||!key||!process.env.BEAM_WEBHOOK_HMAC_KEY)throw new AuthError(503,'ยังไม่พร้อมรับชำระผ่าน Beam');return {merchant,key};}
async function request(path:string,body?:unknown,idem?:string){const c=config();const r=await fetch('https://api.beamcheckout.com/api/v1/charges'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(c.merchant+':'+c.key).toString('base64'),'Content-Type':'application/json',...(idem?{'x-beam-idempotency-key':idem}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new AuthError(502,'ติดต่อ Beam ไม่สำเร็จ กรุณาตรวจสอบรายการเดิมก่อนชำระใหม่');return r.json();}
async function row(id:string){const p=await db.prepare('SELECT * FROM premium_payments WHERE id=?').get(id) as Payment|undefined;if(!p)throw new AuthError(404,'ไม่พบรายการ');return p;}
function view(p:Payment){return {id:p.id,amount:p.amount,status:p.status,qr:p.qr,expires_at:p.expires_at};}
export async function latestPremiumPayment(user:Session){const p=await db.prepare('SELECT * FROM premium_payments WHERE user_id=? ORDER BY created_at DESC LIMIT 1').get(user.id) as Payment|undefined;return p?view(p):null;}
export async function createPremiumPayment(user:Session,input:unknown){
 if(!(await signupInfo(user)).eligible)throw new AuthError(403,'กรุณาใช้บัญชีธุรกิจเพื่อสมัคร Premium');
 if((await db.prepare('SELECT suspended FROM company_memberships WHERE user_id=?').get(user.id))?.suspended)throw new AuthError(403,'บัญชีถูกระงับ กรุณาติดต่อผู้ดูแลก่อนชำระ');
 config();const {idem}=z.object({idem:z.string().uuid()}).strict().parse(input);
 const p=await transaction(async()=>{const old=await db.prepare('SELECT * FROM premium_payments WHERE idem=?').get(idem) as Payment|undefined;if(old){if(old.user_id!==user.id)throw new AuthError(409,'IDEMPOTENCY_CONFLICT');return old;}
 const pending=await db.prepare("SELECT * FROM premium_payments WHERE user_id=? AND (status='CREATING' OR (status='PENDING' AND expires_at>?)) ORDER BY created_at DESC LIMIT 1").get(user.id,new Date().toISOString()) as Payment|undefined;if(pending)return pending;
 const id=randomUUID(),now=new Date().toISOString();await db.prepare("INSERT INTO premium_payments(id,user_id,amount,idem,status,expires_at,created_at) VALUES(?,?,199,?,'CREATING',?,?)").run(id,user.id,idem,new Date(Date.now()+15*60000).toISOString(),now);return row(id);});
 if(p.status!=='CREATING')return view(p);
 if(Date.now()-Date.parse(p.created_at)>11*3600000)throw new AuthError(409,'กรุณาให้แอดมินตรวจรายการที่ยังไม่ทราบผล ห้ามชำระซ้ำ');
 const c=z.object({chargeId:z.string().regex(/^ch_[A-Za-z0-9]+$/),actionRequired:z.literal('ENCODED_IMAGE'),paymentMethodType:z.literal('QR_PROMPT_PAY'),encodedImage:z.object({imageBase64Encoded:z.string().max(1000000).regex(/^[A-Za-z0-9+/]+={0,2}$/),expiry:z.string().datetime({offset:true})})}).parse(await request('',{amount:19900,currency:'THB',referenceId:p.id,returnUrl:new URL('/premium',process.env.APP_URL||'https://jumbogo.app').toString(),paymentMethod:{paymentMethodType:'QR_PROMPT_PAY',qrPromptPay:{expiryTime:p.expires_at}}},p.id));
 if(!Buffer.from(c.encodedImage.imageBase64Encoded,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new AuthError(502,'QR ไม่ถูกต้อง');
 await db.prepare("UPDATE premium_payments SET charge_id=?,qr=?,expires_at=?,status='PENDING' WHERE id=? AND status='CREATING'").run(c.chargeId,'data:image/png;base64,'+c.encodedImage.imageBase64Encoded,c.encodedImage.expiry,p.id);return view(await row(p.id));
}
export async function refreshPremiumPayment(user:Session,id:string){let p=await row(id);if(p.user_id!==user.id)throw new AuthError(403,'FORBIDDEN');if(p.status==='SUCCEEDED'){await queuePaymentEmail('premium',id);await deliverPaymentEmail('premium',id);return view(p);}if(!p.charge_id)return createPremiumPayment(user,{idem:p.idem});
 const c=z.object({chargeId:z.string(),merchantId:z.string(),referenceId:z.string(),amount:z.literal(19900),currency:z.literal('THB'),status:z.string(),paymentMethod:z.object({paymentMethodType:z.literal('QR_PROMPT_PAY')})}).parse(await request('/'+encodeURIComponent(p.charge_id)));
 if(c.chargeId!==p.charge_id||c.referenceId!==p.id||c.merchantId!==config().merchant)throw new AuthError(502,'PAYMENT_MISMATCH');
 if(!['SUCCEEDED','FAILED','CANCELLED','EXPIRED'].includes(c.status))return view(p);
 await transaction(async()=>{p=await row(id);if(p.status==='SUCCEEDED')return;const now=new Date().toISOString();
 if(c.status==='SUCCEEDED'){const m=await db.prepare('SELECT * FROM company_memberships WHERE user_id=?').get(p.user_id);if(m?.suspended)throw new AuthError(409,'บัญชีถูกระงับ กรุณาติดต่อผู้ดูแลเพื่อตรวจสอบยอดชำระ');const expires=new Date(Math.max(Date.now(),Date.parse(String(m?.expires_at||''))||0)+PERIOD).toISOString();
 const settings=await db.prepare('SELECT default_discount_pct FROM company_settings WHERE id=1').get();
 await db.prepare('INSERT INTO company_memberships VALUES(?,?,0,?,?,?) ON CONFLICT(user_id) DO UPDATE SET expires_at=excluded.expires_at,updated_at=excluded.updated_at').run(p.user_id,expires,Number(settings?.default_discount_pct||0),expires,now);
 await db.prepare("UPDATE premium_signup_requests SET status='paid' WHERE user_id=?").run(p.user_id);}
 await db.prepare('UPDATE premium_payments SET status=?,confirmed_at=? WHERE id=?').run(c.status,now,id);if(c.status==='SUCCEEDED')await queuePaymentEmail('premium',id);await audit(p.user_id,'PREMIUM_PAYMENT_RESULT',{id,amount:199,status:c.status});});if(c.status==='SUCCEEDED')await deliverPaymentEmail('premium',id);return view(await row(id));
}
export async function premiumWebhook(raw:Buffer,signature:string|null){if(!verifyBeamSignature(raw,signature,process.env.BEAM_WEBHOOK_HMAC_KEY||''))throw new AuthError(401,'INVALID_SIGNATURE');const e=z.object({referenceId:z.string(),chargeId:z.string(),merchantId:z.string()}).parse(JSON.parse(raw.toString('utf8')));const p=await db.prepare('SELECT * FROM premium_payments WHERE id=?').get(e.referenceId) as Payment|undefined;if(!p)return;if(e.merchantId!==config().merchant||p.charge_id&&p.charge_id!==e.chargeId)throw new AuthError(409,'PAYMENT_MISMATCH');if(!p.charge_id)throw new AuthError(503,'PAYMENT_CREATION_PENDING');await refreshPremiumPayment({id:p.user_id,role:'user',name:'',phone:''},p.id);}
