import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db,transaction,audit } from './db';
import { AuthError,application,isAdminDriver } from './auth-store';
import { maskPhones,type BoardJob } from '../job-board';
import type { Session } from '../domain';
import {privateAccess,assignment,setAssignment,membership,requirePremium} from './company-store';
import {snapshotCommission} from './board-commission';

await db.migrate(`CREATE TABLE IF NOT EXISTS board_jobs(
 id TEXT PRIMARY KEY,poster_id TEXT NOT NULL REFERENCES users(id),vehicle_type TEXT NOT NULL,job_type TEXT NOT NULL,
 pickup TEXT NOT NULL,dropoff TEXT NOT NULL,scheduled_at TEXT NOT NULL,helpers_count INTEGER NOT NULL,
 price_thb REAL NOT NULL,price_note TEXT NOT NULL,allow_offers INTEGER NOT NULL,body_public TEXT NOT NULL,
 contact_phone_private TEXT NOT NULL,status TEXT NOT NULL,accepted_by TEXT REFERENCES users(id),accepted_at TEXT,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS board_jobs_open ON board_jobs(status,created_at);
 CREATE INDEX IF NOT EXISTS board_jobs_poster ON board_jobs(poster_id);
 CREATE INDEX IF NOT EXISTS board_jobs_driver ON board_jobs(accepted_by);
 CREATE TABLE IF NOT EXISTS job_offers(job_id TEXT NOT NULL REFERENCES board_jobs(id),driver_id TEXT NOT NULL REFERENCES users(id),offer_price_thb REAL NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(job_id,driver_id));`);
const text=(max:number)=>z.string().trim().min(1).max(max);
const inputSchema=z.object({vehicle_type:z.enum(['pickup','box','cage','jumbo','six']),job_type:text(100),pickup:text(250),dropoff:text(250),scheduled_at:z.string().datetime({offset:true}),helpers_count:z.number().int().min(0).max(20),price_thb:z.number().positive().max(1000000).multipleOf(0.01),price_note:z.string().trim().max(300).default(''),allow_offers:z.boolean().default(false),body_public:z.string().trim().max(4000).default(''),contact_phone_private:z.string().trim().regex(/^(?:0|\+66)[\d .()-]{7,20}$/)});
const fail=(status:number,message:string):never=>{throw new AuthError(status,message);};
export async function canPostBoard(user:Session|null) {return !!user&&(user.role==='admin'||user.role==='user');}
async function expire() {await db.prepare("UPDATE board_jobs SET status='expired' WHERE status='open' AND scheduled_at<=?").run(new Date().toISOString());}
async function raw(id:string) {const job=await db.prepare('SELECT * FROM board_jobs WHERE id=?').get(id) as BoardJob|undefined;return job||fail(404,'ไม่พบงาน');}
function visible(job:BoardJob,user:Session|null):BoardJob {
 const {contact_phone_private,...rest}=job;
 const allowed=user&&(user.role==='admin'||user.id===job.poster_id||(process.env.JOB_BOARD_SHARE_ACCEPTED_PHONE!=='false'&&job.accepted_by===user.id));
 return allowed?{...rest,contact_phone_private}:rest;
}
export async function boardDetail(id:string,user:Session|null) {await expire();const job=await raw(id);const a=await privateAccess(id,job.poster_id,user);return {...visible(job,user),assignment:a?{driver_id:String(a.driver_id),state:String(a.state)}:null,fee_discount_pct:Number((await db.prepare('SELECT discount_pct FROM board_fee_terms WHERE job_id=?').get(id))?.discount_pct||0)};}
export async function boardList(user:Session|null,params:URLSearchParams) {
 await expire();const where:string[]=[];const args:(string|number)[]=[];
 if(params.get('mine')==='1'){if(!user)fail(401,'กรุณาเข้าสู่ระบบ');where.push('(poster_id=? OR accepted_by=? OR EXISTS(SELECT 1 FROM board_assignments a WHERE a.job_id=board_jobs.id AND a.driver_id=?))');args.push(user!.id,user!.id,user!.id);}else where.push("status='open'");
 if(user?.role!=='admin'){where.push('(NOT EXISTS(SELECT 1 FROM board_assignments a WHERE a.job_id=board_jobs.id) OR poster_id=? OR EXISTS(SELECT 1 FROM board_assignments a WHERE a.job_id=board_jobs.id AND a.driver_id=?))');args.push(user?.id||'',user?.id||'');}
 const vehicle=params.get('vehicle');if(vehicle){where.push('vehicle_type=?');args.push(vehicle);}
 const province=params.get('province')?.trim();if(province){where.push('(instr(pickup,?)>0 OR instr(dropoff,?)>0)');args.push(province,province);}
 const day=params.get('date');if(day&&/^\d{4}-\d{2}-\d{2}$/.test(day)){where.push('scheduled_at>=? AND scheduled_at<?');const start=new Date(day+'T00:00:00+07:00');args.push(start.toISOString(),new Date(start.getTime()+86400000).toISOString());}
 for(const [key,op]of [['min','>='],['max','<=']]){const value=params.get(key);if(value&&Number.isFinite(Number(value))){where.push(`price_thb${op}?`);args.push(Number(value));}}
 const rows=await db.prepare(`SELECT board_jobs.*,(SELECT state FROM board_assignments a WHERE a.job_id=board_jobs.id) AS assignment_state,(SELECT driver_id FROM board_assignments a WHERE a.job_id=board_jobs.id) AS assignment_driver FROM board_jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`).all(...args);
 return rows.map(row=>{const {assignment_state,assignment_driver,...job}=row;return {...visible(job as unknown as BoardJob,user),assignment:assignment_driver?{driver_id:String(assignment_driver),state:String(assignment_state)}:null};});
}
export async function saveBoard(user:Session,input:unknown,id?:string) {
 if(!await canPostBoard(user))fail(403,'เฉพาะลูกค้าผู้โพสต์หรือผู้ดูแลระบบ');
 const p=inputSchema.parse(input);const extra=z.object({assigned_driver_id:z.string().trim().min(1).max(100).optional(),repeat_from:z.string().uuid().optional()}).parse(input);if(extra.repeat_from){await requirePremium(user,'repeat_post');if((await raw(extra.repeat_from)).poster_id!==user.id)fail(403,'โพสต์ซ้ำได้เฉพาะงานของคุณ');}if(Date.parse(p.scheduled_at)<=Date.now())fail(400,'เวลานัดต้องอยู่ในอนาคต');
 const fields=[p.vehicle_type,maskPhones(p.job_type),maskPhones(p.pickup),maskPhones(p.dropoff),new Date(p.scheduled_at).toISOString(),p.helpers_count,p.price_thb,maskPhones(p.price_note),Number(p.allow_offers),maskPhones(p.body_public),p.contact_phone_private];
 return transaction(async()=>{
  await expire();const key=id||randomUUID();
  if(id){const job=await raw(id);if(job.poster_id!==user.id)fail(403,'แก้ไขได้เฉพาะงานของคุณ');if(job.status!=='open')fail(409,'แก้ไขได้เฉพาะงานที่ยังไม่มีคนรับ');if(await assignment(id))fail(409,'กรุณาเปิดรับทั่วไปก่อนแก้รายละเอียดงานส่งตรง');
   await db.prepare('UPDATE board_jobs SET vehicle_type=?,job_type=?,pickup=?,dropoff=?,scheduled_at=?,helpers_count=?,price_thb=?,price_note=?,allow_offers=?,body_public=?,contact_phone_private=? WHERE id=?').run(...fields,key);
   await db.prepare("UPDATE job_offers SET status='invalidated' WHERE job_id=? AND status='pending'").run(key);
  }else await db.prepare("INSERT INTO board_jobs(id,poster_id,vehicle_type,job_type,pickup,dropoff,scheduled_at,helpers_count,price_thb,price_note,allow_offers,body_public,contact_phone_private,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?)").run(key,user.id,...fields,new Date().toISOString());
  if(!id){await snapshotCommission(key);await db.prepare('INSERT INTO board_fee_terms VALUES(?,?)').run(key,(await membership(user.id)).discount_pct);if(extra.assigned_driver_id)await setAssignment(user,key,extra.assigned_driver_id);}
  await audit(user.id,id?'BOARD_EDIT':'BOARD_POST',{id:key});return boardDetail(key,user);
 });
}
async function driverFor(user:Session,job:BoardJob) {if(user.role!=='driver'||user.id===job.poster_id)fail(403,'เฉพาะคนขับ');if(await isAdminDriver(user))return;const app=await application(user.id);if(app?.status!=='APPROVED')fail(403,'คนขับต้องผ่านการตรวจสอบ');if(app?.personal?.vehicleType!==job.vehicle_type)fail(403,'ประเภทรถไม่ตรงกับงาน');}
export async function acceptBoard(user:Session,id:string,chosenDriver?:string) {
 return transaction(async()=>{
  await expire();const job=await raw(id);if(job.status!=='open')fail(409,job.status==='expired'?'งานหมดอายุแล้ว':'งานนี้มีคนรับแล้ว');
  const assigned=await privateAccess(id,job.poster_id,user);if(assigned&&(assigned.driver_id!==user.id||assigned.state!=='pending'))fail(409,'คำเชิญนี้ไม่พร้อมรับงาน');
  let driver=user,price=job.price_thb;
  if(job.allow_offers){if(user.id!==job.poster_id||!chosenDriver)fail(403,'ผู้โพสต์ต้องเลือกข้อเสนอ');
   const offer=await db.prepare("SELECT offer_price_thb FROM job_offers WHERE job_id=? AND driver_id=? AND status='pending'").get(id,chosenDriver!);if(!offer)fail(404,'ไม่พบข้อเสนอ');
   driver=await db.prepare('SELECT id,name,phone,role FROM users WHERE id=?').get(chosenDriver!) as unknown as Session;price=Number(offer!.offer_price_thb);
  }else if(chosenDriver)fail(400,'งานนี้รับตามราคาที่ประกาศ');
  await driverFor(driver,job);
  const result=await db.prepare("UPDATE board_jobs SET status='accepted',accepted_by=?,accepted_at=?,price_thb=? WHERE id=? AND status='open'").run(driver.id,new Date().toISOString(),price,id);
  if(result.changes!==1)fail(409,'งานนี้มีคนรับแล้ว');
  if(assigned)await db.prepare("UPDATE board_assignments SET state='accepted' WHERE job_id=?").run(id);
  await db.prepare("UPDATE job_offers SET status=CASE WHEN driver_id=? THEN 'accepted' ELSE 'rejected' END WHERE job_id=? AND status='pending'").run(driver.id,id);
  await audit(user.id,'BOARD_ACCEPT',{id,driver_id:driver.id});return visible(await raw(id),user);
 });
}
export async function offerBoard(user:Session,id:string,input:unknown) {
 const p=z.object({offer_price_thb:z.number().positive().max(1000000).multipleOf(0.01)}).parse(input);
 return transaction(async()=>{await expire();const job=await raw(id);await privateAccess(id,job.poster_id,user);await driverFor(user,job);if(job.status!=='open'||!job.allow_offers)fail(409,'งานนี้ไม่เปิดรับข้อเสนอ');
 await db.prepare("INSERT INTO job_offers VALUES(?,?,?,'pending',?) ON CONFLICT(job_id,driver_id) DO UPDATE SET offer_price_thb=excluded.offer_price_thb,status='pending',created_at=excluded.created_at").run(id,user.id,p.offer_price_thb,new Date().toISOString());await audit(user.id,'BOARD_OFFER',{id});return {ok:true};});
}
export async function boardOffers(id:string,user:Session|null) {const job=await raw(id);await privateAccess(id,job.poster_id,user);if(!user)return [];return db.prepare('SELECT driver_id,offer_price_thb,status,created_at FROM job_offers WHERE job_id=?'+(user.id===job.poster_id||user.role==='admin'?'':' AND driver_id=?')).all(id,...(user.id===job.poster_id||user.role==='admin'?[]:[user.id]));}
export async function boardStatus(user:Session,id:string,status:string) {
 return transaction(async()=>{await expire();const job=await raw(id);
 const cancel=status==='cancelled'&&job.status==='open'&&job.poster_id===user.id;
 const advance=job.accepted_by===user.id&&((job.status==='accepted'&&status==='in_progress')||(job.status==='in_progress'&&status==='done'));
 if(!cancel&&!advance)fail(403,'ไม่สามารถเปลี่ยนสถานะงานนี้');
 await db.prepare('UPDATE board_jobs SET status=? WHERE id=?').run(status,id);await audit(user.id,'BOARD_STATUS',{id,status});return visible(await raw(id),user);});
}
