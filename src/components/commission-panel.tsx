'use client';
import {useEffect,useState} from 'react';
type Job={id:string;poster_id:string;status:string;price_thb:number;rate:number;paid_satang:number;refunded_satang:number;confirmed_satang:number;pending_satang:number;state:string};
type Data={rate:number;confirmed_satang:number;pending_satang:number;jobs:Job[];history:{actor:string;action:string;detail:string;at:string}[]};
const money=(n:number)=>(n/100).toLocaleString('th-TH',{minimumFractionDigits:2});
export function CommissionPanel({admin=false}:{admin?:boolean}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function load(){const r=await fetch('/api/commissions',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 async function save(body:unknown){setBusy(true);setError('');setNotice('');try{const r=await fetch('/api/commissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);await load();setNotice('บันทึกแล้ว');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className="panel jb-panel jb-commission" open={admin||undefined}><summary>ค่าคอมสะสมของฉัน{admin?' / จัดการค่าคอมลูกค้า':data?` · ฿${money(data.confirmed_satang)}`:''}<span className="jb-commission-hint">กดเพื่อดูรายละเอียด</span></summary><div className="jb-form">{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{!data?<p>กำลังโหลดค่าคอม…</p>:<>
 <p>อัตรางานใหม่ <strong>{data.rate}%</strong> ของค่าขนส่ง ไม่มีเพดาน · ล็อกอัตราตอนโพสต์งาน</p>
 <p>ยอดยืนยันสะสม <strong>฿{money(data.confirmed_satang)}</strong> · รอยืนยันโดยประมาณ <strong>฿{money(data.pending_satang)}</strong></p>
 <p>รับค่าคอมเมื่องานเสร็จและยืนยันชำระแล้ว ยอดสะสมยังไม่ใช่ยอด Wallet และยังไม่เปิดถอนเงิน งานก่อนเปิดระบบนี้ไม่มีการคิดย้อนหลัง</p>
 {admin&&<form className="jb-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(confirm('เปลี่ยนอัตราสำหรับงานใหม่เท่านั้น?'))void save({kind:'rate',rate:Number(f.get('rate'))});}}><label className="field">ค่าคอมงานใหม่ (%)<input key={data.rate} name="rate" type="number" min="0" max="100" step="0.01" defaultValue={data.rate} required/></label><button className="button primary" disabled={busy}>บันทึกอัตราค่าคอม</button></form>}
 <h3>รายการค่าคอม (ล่าสุดไม่เกิน 200 งาน)</h3>{!data.jobs.length&&<p>ยังไม่มีงานสะสมค่าคอม</p>}
 {data.jobs.map(j=><details key={j.id} className="panel jb-panel"><summary style={{overflowWrap:'anywhere'}}>งาน {j.id.slice(0,8)} · {j.rate}% · ฿{money(j.confirmed_satang||j.pending_satang)} · {({pending:'รอยืนยัน',confirmed:'ยืนยันแล้ว',refunded:'คืนเงินแล้ว',ineligible:'ไม่มีสิทธิ์'} as Record<string,string>)[j.state]}</summary><p>ค่ารถ ฿{Number(j.price_thb).toLocaleString('th-TH')} · อัตราที่ล็อก {j.rate}% · คืนเงินสะสม ฿{money(Number(j.refunded_satang))}</p><a href={'/jobs/'+j.id}>ดูรายละเอียดงาน</a>
 {admin&&j.status==='done'&&!j.paid_satang&&<form className="jb-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(confirm('ตรวจหลักฐานชำระเงินจริงและยอดค่ารถครบแล้วใช่หรือไม่?'))void save({kind:'payment',job_id:j.id,paid_thb:Number(j.price_thb),reference:String(f.get('reference'))});}}><label className="field">เลขอ้างอิงการชำระที่ตรวจสอบแล้ว<input name="reference" minLength={3} maxLength={120} required/></label><button className="button primary" disabled={busy}>ยืนยันชำระ ฿{Number(j.price_thb).toLocaleString('th-TH')}</button></form>}
 {admin&&!!j.paid_satang&&<form className="jb-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(confirm('ยืนยันปรับลดค่าคอมตามยอดคืนเงินสะสม?'))void save({kind:'refund',job_id:j.id,refunded_thb:Number(f.get('refund')),reason:String(f.get('reason'))});}}><label className="field">ยอดคืนเงินสะสม (บาท)<input name="refund" type="number" min={Number(j.refunded_satang)/100} max={Number(j.paid_satang)/100} step="0.01" required/></label><label className="field">เหตุผล / อ้างอิงคืนเงิน<input name="reason" minLength={3} maxLength={300} required/></label><button className="button secondary" disabled={busy}>บันทึกคืนเงินและปรับค่าคอม</button></form>}
 </details>)}
 {admin&&<details><summary>ประวัติการเปลี่ยนแปลง 50 รายการล่าสุด</summary>{data.history.map((h,i)=><p key={i} style={{overflowWrap:'anywhere'}}>{h.at} · {h.actor} · {h.action} · {h.detail}</p>)}</details>}
 </>}</div></details>;
}
