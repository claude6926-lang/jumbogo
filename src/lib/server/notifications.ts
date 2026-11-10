import type {Session,Job,LedgerEntry} from '../domain';
import type {AppNotification,NotificationFeed} from '../notifications';
import {db,transaction,getJobs,ledger} from './db';
import {driverApproved} from './auth-store';
import {workState} from './driver-store';
import {acceptanceError} from '../driver-jobs';
import './job-board-store';

await db.migrate(`CREATE TABLE IF NOT EXISTS notification_reads(
 user_id TEXT NOT NULL REFERENCES users(id),event_id TEXT NOT NULL,read_at TEXT NOT NULL,
 PRIMARY KEY(user_id,event_id));`);

const labels:Record<string,[string,string]>={
 SEARCHING:['กำลังค้นหาคนขับ','Finding a driver'],ACCEPTED:['คนขับรับงานแล้ว','Delivery accepted'],
 ARRIVING:['คนขับกำลังไปจุดรับ','Driver is on the way'],ARRIVED_PICKUP:['คนขับถึงจุดรับแล้ว','Driver arrived at pickup'],
 PICKED_UP:['รับสินค้าแล้ว','Cargo collected'],IN_TRANSIT:['กำลังขนส่งสินค้า','Delivery in transit'],
 ARRIVED_DROPOFF:['ถึงจุดส่งแล้ว','Arrived at drop-off'],COMPLETED:['ขนส่งสำเร็จ','Delivery completed'],
 CANCELLED:['งานถูกยกเลิก','Delivery cancelled'],FAILED:['ไม่สามารถจัดรถได้','Unable to find a driver'],
};
export function jobNotifications(user:Session,jobs:Job[]):AppNotification[]{
 return jobs.filter(j=>j.userId===user.id||j.driverId===user.id).flatMap(job=>job.history.flatMap((event,index)=>{
  const label=labels[event.to];
  if(!label||user.role==='driver'&&['CREATED','SEARCHING'].includes(event.to))return [];
  const detail=`JMG–${job.id.slice(0,8).toUpperCase()} · ${job.pickup} → ${job.drops.at(-1)||''}`;
  return [{id:`job:${job.id}:${index}`,kind:'job' as const,title:label[0],titleEn:label[1],detail,detailEn:detail,at:event.at,read:false,jobId:job.id}];
 }));
}
export function walletNotifications(entries:LedgerEntry[]):AppNotification[]{
 return entries.map(entry=>{const positive=entry.amount>=0;const title=entry.kind==='WELCOME'?'ได้รับเครดิตต้อนรับ':entry.kind==='REFUND'?'คืนเครดิตแล้ว':positive?'เครดิตเข้ากระเป๋า':'หักเครดิตจากกระเป๋า';
  const amount=`${positive?'+':''}${entry.amount.toLocaleString('en-US')}`;
  return {id:`wallet:${entry.id}`,kind:'wallet',title,titleEn:entry.kind==='WELCOME'?'Welcome credit received':entry.kind==='REFUND'?'Credit refunded':positive?'Wallet credited':'Wallet debited',detail:`${amount} เครดิต · ดูรายละเอียดในกระเป๋าเงิน`,detailEn:`${amount} credits · View wallet details`,at:entry.at,read:false};
 });
}
export async function notificationFeed(user:Session):Promise<NotificationFeed>{
 if(user.role==='admin')return {items:[],unread:0};
 const jobs=await getJobs(user.id,user.role);
 const offers:AppNotification[]=[];
 if(user.role==='driver'&&await driverApproved(user)){
  const work=await workState(user.id);
  if(work?.online)for(const job of jobs)if(job.vehicle===work.vehicle&&!acceptanceError(job,jobs,user.id)){
   const detail=`JMG–${job.id.slice(0,8).toUpperCase()} · ${job.pickup} → ${job.drops.at(-1)||''}`;
   offers.push({id:`offer:${job.id}`,kind:'job',title:'มีงานใหม่สำหรับรถของคุณ',titleEn:'New delivery for your vehicle',detail,detailEn:detail,at:job.createdAt,read:false,jobId:job.id});
  }
 }
 const board=await db.prepare('SELECT id,accepted_at FROM board_jobs WHERE poster_id=? AND accepted_by IS NOT NULL ORDER BY accepted_at DESC LIMIT 50').all(user.id);
 for(const row of board)offers.push({id:`board:${row.id}`,kind:'board',title:'มีคนขับรับงานกระดานแล้ว',titleEn:'Board job accepted',detail:'เปิดดูรายละเอียดและสถานะงาน',detailEn:'View job details and status',at:String(row.accepted_at),jobId:String(row.id),read:false});
 const entries=await ledger(user.id) as LedgerEntry[];
 const messages=await db.prepare(`SELECT m.id,m.job_id,m.at FROM messages m JOIN jobs j ON j.id=m.job_id
 WHERE (j.user_id=? OR j.driver_id=?) AND m.sender!=? ORDER BY m.at DESC LIMIT 100`).all(user.id,user.id,user.id);
 const reads=new Set((await db.prepare('SELECT event_id FROM notification_reads WHERE user_id=?').all(user.id)).map(r=>String(r.event_id)));
 const items:AppNotification[]=[...offers,...jobNotifications(user,jobs),...walletNotifications(entries),...messages.map(m=>({id:`message:${m.id}`,kind:'message' as const,title:'มีข้อความใหม่ในงานขนส่ง',titleEn:'New delivery message',detail:`JMG–${String(m.job_id).slice(0,8).toUpperCase()} · เปิดแชตเพื่ออ่านข้อความ`,detailEn:`JMG–${String(m.job_id).slice(0,8).toUpperCase()} · Open conversation`,at:String(m.at),jobId:String(m.job_id),read:false}))]
  .sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id)).slice(0,100).map(item=>({...item,read:reads.has(item.id)}));
 return {items,unread:items.filter(item=>!item.read).length};
}
export async function readNotifications(user:Session,ids:string[]){
 return transaction(async()=>{
  const feed=await notificationFeed(user);
  const owned=new Set(feed.items.map(item=>item.id));
  for(const id of new Set(ids))if(owned.has(id))await db.prepare('INSERT OR IGNORE INTO notification_reads VALUES(?,?,?)').run(user.id,id,new Date().toISOString());
  return notificationFeed(user);
 });
}
