import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db,transaction,audit,balance} from './db';
import {AuthError} from './auth-store';
import {verifyBeamSignature} from './beam-signature';

import type {Session} from '../domain';

await db.migrate(`CREATE TABLE IF NOT EXISTS beam_wallet_payments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL CHECK(amount>0),status TEXT NOT NULL,idem TEXT UNIQUE NOT NULL,charge_id TEXT UNIQUE,qr TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,confirmed_at TEXT,reference TEXT);
CREATE INDEX IF NOT EXISTS beam_wallet_owner ON beam_wallet_payments(user_id,created_at);`);
type Payment={id:string;user_id:string;amount:number;status:string;idem:string;charge_id:string|null;qr:string|null;created_at:string;expires_at:string;confirmed_at:string|null;reference:string|null};
function config(){const merchant=process.env.BEAM_MERCHANT_ID?.trim(),key=process.env.BEAM_API_KEY?.trim();if(!merchant||!key)throw new AuthError(503,'BEAM_NOT_CONFIGURED');return {merchant,key};}
async function request(path:string,body?:unknown,idem?:string){const {merchant,key}=config();const response=await fetch('https://api.beamcheckout.com/api/v1/charges'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(merchant+':'+key).toString('base64'),'Content-Type':'application/json',...(idem?{'x-beam-idempotency-key':idem}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new AuthError(502,'BEAM_PROVIDER_ERROR');return response.json();}
async function row(id:string){const p=await db.prepare('SELECT * FROM beam_wallet_payments WHERE id=?').get(id) as Payment|undefined;if(!p)throw new AuthError(404,'NOT_FOUND');return p;}
function access(user:Session,p:Payment){if(user.role!=='admin'&&p.user_id!==user.id)throw new AuthError(403,'FORBIDDEN');}
function view(p:Payment){const {idem:_,...rest}=p;void _;return {...rest,mode:'beam_live'};}
const chargeSchema=z.object({chargeId:z.string(),merchantId:z.string(),referenceId:z.string(),amount:z.number().int(),currency:z.literal('THB'),status:z.string(),paymentMethod:z.object({paymentMethodType:z.literal('QR_PROMPT_PAY')})});
export async function refreshBeam(user:Session,id:string){let p=await row(id);access(user,p);if(p.status==='CREATING'&&!p.charge_id&&user.role!=='admin')return createBeam(user,{amount:p.amount,idem:p.idem});if(p.status==='SUCCEEDED')return view(p);if(!p.charge_id)return view(p);
 const c=chargeSchema.parse(await request('/'+encodeURIComponent(p.charge_id)));
 if(c.chargeId!==p.charge_id||c.referenceId!==p.id||c.merchantId!==config().merchant||c.amount!==p.amount*100)throw new AuthError(502,'PAYMENT_MISMATCH');
 if(!['SUCCEEDED','FAILED','EXPIRED','CANCELLED'].includes(c.status))return view(p);
 await transaction(async()=>{p=await row(id);if(p.status==='SUCCEEDED')return;const at=new Date().toISOString();
  if(c.status==='SUCCEEDED')await db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(randomUUID(),p.user_id,p.amount,'TOPUP',null,'beam:'+p.id,at);
  await db.prepare('UPDATE beam_wallet_payments SET status=?,confirmed_at=?,reference=? WHERE id=?').run(c.status==='CANCELLED'?'FAILED':c.status,at,c.chargeId,id);

  await audit('beam','BEAM_PAYMENT_RESULT',{id,status:c.status,amount:p.amount});
 });return view(await row(id));
}
export async function createBeam(user:Session,input:unknown){if(process.env.WALLET_PAYMENT_MODE!=='beam_live')throw new AuthError(503,'PAYMENTS_DISABLED');if(user.role==='admin')throw new AuthError(403,'FORBIDDEN');config();if(!process.env.BEAM_WEBHOOK_HMAC_KEY)throw new AuthError(503,'BEAM_NOT_CONFIGURED');
 const data=z.object({amount:z.number().int().min(20).max(100000),idem:z.string().uuid()}).parse(input);
 const p=await transaction(async()=>{const old=await db.prepare('SELECT * FROM beam_wallet_payments WHERE idem=?').get(data.idem) as Payment|undefined;if(old){if(old.user_id!==user.id||old.amount!==data.amount)throw new AuthError(409,'IDEMPOTENCY_CONFLICT');return old;}const id=randomUUID(),at=new Date().toISOString(),expires=new Date(Date.now()+15*60000).toISOString();await db.prepare("INSERT INTO beam_wallet_payments(id,user_id,amount,status,idem,created_at,expires_at) VALUES(?,?,?,'CREATING',?,?,?)").run(id,user.id,data.amount,data.idem,at,expires);return row(id);});
 if(p.status!=='CREATING')return view(p);
 // Do not re-create uncertain charges past Beam's 12-hour idempotency retention.
 if(Date.now()-Date.parse(p.created_at)>11*3600000)throw new AuthError(409,'PAYMENT_RECONCILIATION_REQUIRED');
 const result=z.object({chargeId:z.string().regex(/^ch_[A-Za-z0-9]+$/),actionRequired:z.literal('ENCODED_IMAGE'),paymentMethodType:z.literal('QR_PROMPT_PAY'),encodedImage:z.object({imageBase64Encoded:z.string().max(1000000).regex(/^[A-Za-z0-9+/]+={0,2}$/),expiry:z.string().datetime({offset:true})})}).safeParse(await request('',{amount:p.amount*100,currency:'THB',referenceId:p.id,returnUrl:new URL('/'+user.role+'/wallet',process.env.APP_URL||'https://jumbogo.app').toString(),paymentMethod:{paymentMethodType:'QR_PROMPT_PAY',qrPromptPay:{expiryTime:p.expires_at}}},p.id));
 if(!result.success){const fields=result.error.issues.map(issue=>issue.path.join('.'));console.error('BEAM_RESPONSE_SCHEMA',{paymentId:p.id,fields});throw new AuthError(502,'BEAM_RESPONSE_INVALID: '+fields.join(', '));}
 const c=result.data;
 const bytes=Buffer.from(c.encodedImage.imageBase64Encoded,'base64');if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new AuthError(502,'INVALID_QR_IMAGE');
 await db.prepare("UPDATE beam_wallet_payments SET charge_id=?,qr=?,expires_at=?,status='PENDING' WHERE id=? AND status='CREATING'").run(c.chargeId,'data:image/png;base64,'+c.encodedImage.imageBase64Encoded,c.encodedImage.expiry,p.id);return view(await row(p.id));
}
export async function beamList(user:Session){const rows=await db.prepare(`SELECT p.*,u.name FROM beam_wallet_payments p JOIN users u ON u.id=p.user_id ${user.role==='admin'?'':'WHERE p.user_id=?'} ORDER BY p.created_at DESC LIMIT 100`).all(...(user.role==='admin'?[]:[user.id]));return {mode:'beam_live',balance:await balance(user.id),testBalance:0,payments:rows.map(p=>view(p as Payment))};}
export async function beamWebhook(raw:Buffer,signature:string|null){if(!verifyBeamSignature(raw,signature,process.env.BEAM_WEBHOOK_HMAC_KEY||''))throw new AuthError(401,'INVALID_SIGNATURE');const event=z.object({chargeId:z.string(),merchantId:z.string(),referenceId:z.string()}).parse(JSON.parse(raw.toString('utf8')));if(event.merchantId!==config().merchant)throw new AuthError(403,'WRONG_MERCHANT');const p=await db.prepare('SELECT * FROM beam_wallet_payments WHERE id=?').get(event.referenceId) as Payment|undefined;if(!p)return;if(!p.charge_id)throw new AuthError(503,'PAYMENT_CREATION_PENDING');if(p.charge_id!==event.chargeId)throw new AuthError(409,'PAYMENT_MISMATCH');await refreshBeam({id:p.user_id,role:'user',name:'',phone:''},p.id);}
export async function beamReceipt(user:Session,id:string){const p=await row(id);access(user,p);if(p.status!=='SUCCEEDED')throw new AuthError(409,'PAYMENT_NOT_CONFIRMED');return {document:'JUMBO GO PAYMENT CONFIRMATION',testOnly:false,notTaxInvoice:true,paymentId:p.id,amount:p.amount,currency:'THB',reference:p.reference,confirmedAt:p.confirmed_at};}
