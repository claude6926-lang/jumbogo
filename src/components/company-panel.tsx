'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Brand} from './ui';
import './job-board.css';
import {PremiumRightsEditor} from './premium-plans';
import {CommissionPanel} from './commission-panel';
type Member={active:boolean;expires_at:string;discount_pct:number;discount_expires_at:string};
type Settings={monthly_thb:number;default_discount_pct:number};
type Account={id:string;name:string;expires_at:string|null;suspended:number|null;discount_pct:number|null;discount_expires_at:string|null};
type Data={membership?:Member;settings:Settings;drivers?:{id:string;name:string}[];accounts?:Account[];history?:{actor:string;detail:string;at:string}[];signupRequests?:{user_id:string;name:string;requested_at:string}[]};
async function api(path='',body?:unknown):Promise<Data>{const r=await fetch('/api/company'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
const date=(s?:string|null)=>s?s.slice(0,10):'';
export function CompanyPanel({admin=false}:{admin?:boolean}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>api(admin?'/admin':'').then(setData);useEffect(()=>{void api(admin?'/admin':'').then(setData).catch(e=>setError(e.message));},[admin]);
 async function save(path:string,body:unknown){setBusy(true);setError('');setNotice('');try{await api(path,body);await load();setNotice('บันทึกแล้ว');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="job-board"><header className="jb-header"><Link href="/" aria-label="JUMBO GO หน้าแรก"><Brand/></Link><nav><Link href="/jobs">กระดานงาน</Link><Link href="/jobs/mine">งานของฉัน</Link><Link href={admin?'/admin':'/user/home'}>กลับระบบหลัก</Link></nav></header><h1>{admin?'แพ็กเกจและสิทธิประโยชน์':'บริษัทและคนขับประจำ'}</h1>{error&&<p role="alert" className="jb-alert">{error}</p>}{notice&&<p role="status" className="jb-notice">{notice}</p>}
 {!admin&&<Link className="button primary" href="/premium">สมัคร / ดูแพ็กเกจ Premium</Link>}
 {data&&(admin?<>
 <CommissionPanel admin/>
 <PremiumRightsEditor accounts={data.accounts||[]} onSaved={()=>{void load();}}/>
 <section className="panel jb-panel"><h2>คำขอสมัคร Premium</h2><p>คำขอเดิมก่อนเปิดชำระด้วย QR ไม่ใช่หลักฐานการชำระเงิน</p>{data.signupRequests?.length?data.signupRequests.map(r=><p key={r.user_id}>{r.name} · {r.user_id} · {new Date(r.requested_at).toLocaleString('th-TH')}</p>):<p>ยังไม่มีคำขอ</p>}</section>
 <form key={notice} className="panel jb-panel jb-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const account=data.accounts?.find(a=>a.id===f.get('account'));void save('/admin',{kind:'account',user_id:f.get('account'),expires_at:new Date(String(f.get('expiry'))+'T23:59:59+07:00').toISOString(),suspended:f.get('suspended')==='on',discount_pct:account?.discount_pct||0,discount_expires_at:account?.discount_expires_at||new Date().toISOString()});}}><h2>เปิด / ต่ออายุ / ระงับ Premium</h2><label className="field">บัญชีลูกค้า<select name="account" required><option value="">เลือกบัญชี</option>{data.accounts?.map(a=><option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}</select></label><label className="field">Premium หมดอายุ<input name="expiry" type="date" required/></label><label><input type="checkbox" name="suspended"/> ระงับ Premium</label><p>อัตราค่าคอมกำหนดแยกด้านบน ไม่ขึ้นกับสถานะ Premium</p><button className="button primary" disabled={busy}>ยืนยันบันทึกสิทธิ์</button></form>
 <section className="panel jb-panel"><h2>สมาชิกและสิทธิ์ที่ตั้งไว้</h2>{data.accounts?.filter(a=>a.expires_at).map(a=><p key={a.id}>{a.name} · {a.suspended?'ระงับ':Date.parse(a.expires_at!)>Date.now()?'Premium':'หมดอายุ'} ถึง {date(a.expires_at)}</p>)}</section>
 <section className="panel jb-panel"><h2>ประวัติการตั้งค่า 50 รายการล่าสุด</h2>{data.history?.map((h,i)=><details key={h.at+i}><summary>{new Date(h.at).toLocaleString('th-TH')} · ผู้แก้ไข {h.actor}</summary><p className="jb-body">{h.detail}</p></details>)}</section>
 </>:<><section className="panel jb-panel"><h2>{data.membership?.active?'Premium ใช้งานได้':'บัญชีทั่วไป / Premium ไม่พร้อมใช้งาน'}</h2><p>Premium ถึง {date(data.membership?.expires_at)||'-'} · แพ็กเกจ ฿{199}/30 วัน</p><p>สมัครหรือต่ออายุผ่านเมนู Premium งานที่รับไปแล้วดำเนินต่อได้เมื่อ Premium หมดอายุ</p></section>
 <form className="panel jb-panel jb-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save('/drivers',{driver_id:f.get('id')});}}><h2>คนขับประจำ</h2><label className="field">รหัสบัญชีคนขับที่ผ่านอนุมัติ<input name="id" required maxLength={100}/></label><button className="button primary" disabled={busy||!data.membership?.active}>เพิ่มคนขับประจำ</button><p>ขอรหัสบัญชีจากคนขับ ไม่ค้นหาหรือเผยแพร่เบอร์โทรส่วนตัว</p></form>
 <section className="panel jb-panel">{data.drivers?.map(d=><div className="jb-offer" key={d.id}><span>{d.name} · {d.id}</span><button className="button secondary" disabled={busy||!data.membership?.active} onClick={()=>{if(confirm('ลบออกจากคนขับประจำ? งานเดิมยังคงอยู่'))void save('/remove-driver/'+encodeURIComponent(d.id),{});}}>นำออกจากรายชื่อ</button></div>)}</section></>)}
 </main>;
}
