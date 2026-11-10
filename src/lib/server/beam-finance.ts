import {z} from 'zod';
import {AuthError} from './auth-store';
import {beamList} from './beam-wallet';
import type {Session} from '../domain';
const transactionSchema=z.object({transactionId:z.string(),transactionType:z.string(),grossAmount:z.number().int(),feeAmount:z.number().int(),vatAmount:z.number().int(),netAmount:z.number().int()});
let cache:{at:number;transactions:z.infer<typeof transactionSchema>[]}|undefined;
export async function beamFinance(user:Session){
 if(user.role!=='admin')throw new AuthError(403,'FORBIDDEN');
 const local=await beamList(user);
 let transactions=cache&&Date.now()-cache.at<60000?cache.transactions:undefined;
 let providerError=false;
 if(!transactions)try{
  const merchant=process.env.BEAM_MERCHANT_ID?.trim(),key=process.env.BEAM_API_KEY?.trim();
  if(!merchant||!key)throw Error('not configured');
  const r=await fetch('https://api.beamcheckout.com/api/v1/transactions?limit=100&offset=0',{headers:{Authorization:'Basic '+Buffer.from(merchant+':'+key).toString('base64')},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('provider unavailable');
  transactions=z.object({data:z.array(transactionSchema)}).parse(await r.json()).data;
  cache={at:Date.now(),transactions};
 }catch{providerError=true;transactions=[];}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());
 const payments=local.payments.map(p=>({...p,qr:undefined,transaction:transactions?.find(t=>t.transactionId===p.charge_id&&t.transactionType==='PAYMENT')||null}));
 const succeeded=payments.filter(p=>p.status==='SUCCEEDED'&&p.confirmed_at&&new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date(p.confirmed_at))===today);
 const complete=!providerError&&succeeded.every(p=>p.transaction);
 return {payments,providerError,summary:{gross:succeeded.reduce((s,p)=>s+p.amount,0),fees:complete?succeeded.reduce((s,p)=>s+(p.transaction!.feeAmount+p.transaction!.vatAmount)/100,0):null,net:complete?succeeded.reduce((s,p)=>s+p.transaction!.netAmount/100,0):null},scope:'100 รายการเติมเงินล่าสุด • สรุปวันนี้ตามเวลาไทย • ยอดสุทธิไม่ใช่ยอดโอนเข้าธนาคาร'};
}
