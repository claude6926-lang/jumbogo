import {z} from 'zod';
import {db,transaction,audit} from './db';
import {AuthError} from './auth-store';
import type {Session} from '../domain';

export const commissionSchema=`CREATE TABLE IF NOT EXISTS board_commission_settings(id INTEGER PRIMARY KEY CHECK(id=1),rate REAL NOT NULL CHECK(rate BETWEEN 0 AND 100));
INSERT OR IGNORE INTO board_commission_settings VALUES(1,3);
CREATE TABLE IF NOT EXISTS board_commissions(job_id TEXT PRIMARY KEY REFERENCES board_jobs(id),rate REAL NOT NULL CHECK(rate BETWEEN 0 AND 100),paid_satang INTEGER NOT NULL DEFAULT 0,refunded_satang INTEGER NOT NULL DEFAULT 0,reference TEXT NOT NULL DEFAULT '',updated_at TEXT, CHECK(refunded_satang>=0 AND refunded_satang<=paid_satang));
CREATE UNIQUE INDEX IF NOT EXISTS board_commission_reference ON board_commissions(reference) WHERE reference<>'';`;
await db.migrate(commissionSchema);
export async function commissionRate(){return Number((await db.prepare('SELECT rate FROM board_commission_settings WHERE id=1').get())?.rate??3);}
export async function snapshotCommission(id:string){await db.prepare('INSERT INTO board_commissions(job_id,rate) VALUES(?,?)').run(id,await commissionRate());}
export function commissionSatang(fareSatang:number,rate:number){return Math.round(fareSatang*Math.round(rate*100)/10000);}
export async function commissionSummary(user:Session){
 const admin=user.role==='admin';
 const rows=await db.prepare(`SELECT j.id,j.poster_id,j.status,j.price_thb,j.created_at,c.rate,c.paid_satang,c.refunded_satang,c.updated_at FROM board_jobs j JOIN board_commissions c ON c.job_id=j.id ${admin?'':'WHERE j.poster_id=?'} ORDER BY j.created_at DESC`).all(...(admin?[]:[user.id]));
 const jobs=rows.map(r=>{const completed=r.status==='done',paid=Number(r.paid_satang),refund=Number(r.refunded_satang),rate=Number(r.rate);return {...r,id:String(r.id),rate,confirmed_satang:completed?commissionSatang(paid-refund,rate):0,pending_satang:!paid&&!['cancelled','expired'].includes(String(r.status))?commissionSatang(Math.round(Number(r.price_thb)*100),rate):0,state:paid?(refund===paid?'refunded':'confirmed'):['cancelled','expired'].includes(String(r.status))?'ineligible':'pending'};});
 return {rate:await commissionRate(),confirmed_satang:jobs.reduce((s,j)=>s+j.confirmed_satang,0),pending_satang:jobs.reduce((s,j)=>s+j.pending_satang,0),jobs:jobs.slice(0,200),history:admin?await db.prepare("SELECT actor,action,detail,at FROM audit WHERE action LIKE 'BOARD_COMMISSION_%' ORDER BY at DESC LIMIT 50").all():[]};
}
const amount=z.number().finite().min(0).max(1000000).multipleOf(0.01);
export async function updateCommission(user:Session,input:unknown){
 if(user.role!=='admin')throw new AuthError(403,'เฉพาะผู้ดูแลระบบ');
 const p=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('rate'),rate:z.number().finite().min(0).max(100).multipleOf(0.01)}),
  z.object({kind:z.literal('payment'),job_id:z.string().uuid(),paid_thb:amount.refine(n=>n>0),reference:z.string().trim().min(3).max(120)}),
  z.object({kind:z.literal('refund'),job_id:z.string().uuid(),refunded_thb:amount,reason:z.string().trim().min(3).max(300)})
 ]).parse(input);
 return transaction(async()=>{
  if(p.kind==='rate')await db.prepare('UPDATE board_commission_settings SET rate=? WHERE id=1').run(p.rate);
  else {
   const row=await db.prepare('SELECT j.status,j.price_thb,c.* FROM board_jobs j JOIN board_commissions c ON c.job_id=j.id WHERE j.id=?').get(p.job_id);
   if(!row)throw new AuthError(404,'ไม่พบงานที่มีสิทธิ์ค่าคอม');
   if(row.status!=='done')throw new AuthError(409,'ต้องเสร็จงานก่อนยืนยันการชำระ');
   if(p.kind==='payment'){
    const paid=Math.round(p.paid_thb*100);
    if(paid!==Math.round(Number(row.price_thb)*100))throw new AuthError(400,'ยอดชำระต้องตรงกับค่ารถที่ตกลงในงาน');
    if(Number(row.paid_satang)>0){if(Number(row.paid_satang)===paid&&row.reference===p.reference)return {ok:true};throw new AuthError(409,'ยืนยันงานนี้แล้ว');}
    if(await db.prepare('SELECT job_id FROM board_commissions WHERE reference=?').get(p.reference))throw new AuthError(409,'เลขอ้างอิงนี้ถูกใช้แล้ว');
    await db.prepare('UPDATE board_commissions SET paid_satang=?,reference=?,updated_at=? WHERE job_id=?').run(paid,p.reference,new Date().toISOString(),p.job_id);
   }else{
    const refund=Math.round(p.refunded_thb*100);
    if(!Number(row.paid_satang)||refund>Number(row.paid_satang)||refund<Number(row.refunded_satang))throw new AuthError(400,'ยอดคืนสะสมต้องไม่ลดลงและไม่เกินยอดชำระ');
    await db.prepare('UPDATE board_commissions SET refunded_satang=?,updated_at=? WHERE job_id=?').run(refund,new Date().toISOString(),p.job_id);
   }
  }
  await audit(user.id,'BOARD_COMMISSION_'+p.kind.toUpperCase(),p);return {ok:true};
 });
}
