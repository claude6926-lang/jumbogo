'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Bell,CheckCheck,ChevronRight,MessageSquare,Package,Wallet} from 'lucide-react';
import {api} from '@/lib/api';
import {useText} from '@/lib/i18n';
import type {AppNotification,NotificationFeed} from '@/lib/notifications';
import {Modal} from './ui';
import './notifications.css';

export function Notifications({onOpen}:{onOpen:(item:AppNotification)=>void}){
 const t=useText();const[feed,setFeed]=useState<NotificationFeed>({items:[],unread:0});
 const[open,setOpen]=useState(false),[filter,setFilter]=useState('all'),[loading,setLoading]=useState(true),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 const revision=useRef(0);
 const refresh=useCallback(async()=>{const version=revision.current;try{const result=await api<NotificationFeed>('notifications');if(version===revision.current){setFeed(result);setError(false);}}catch{setError(true);}finally{setLoading(false);}},[]);
 useEffect(()=>{let active=true;const update=()=>{if(active&&document.visibilityState==='visible')void refresh();};update();const timer=setInterval(update,10000);document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update);};},[refresh]);
 async function mark(ids:string[]){setBusy(true);revision.current++;try{const result=await api<NotificationFeed>('notifications/read',{ids});revision.current++;setFeed(result);setError(false);return true;}catch{setError(true);return false;}finally{setBusy(false);}}
 const items=feed.items.filter(item=>filter==='all'||filter==='unread'&&!item.read||item.kind===filter);
 return <><button className="icon-button notification-button" aria-label={`${t('การแจ้งเตือน','Notifications')}${feed.unread?` (${feed.unread})`:''}`} aria-haspopup="dialog" onClick={()=>{setOpen(true);void refresh();}}><Bell size={20}/>{feed.unread>0&&<span className="notification-count">{feed.unread>99?'99+':feed.unread}</span>}</button>
 {open&&<Modal title={t('การแจ้งเตือน','Notifications')} onClose={()=>setOpen(false)}><div className="notification-summary"><p>{t('งานขนส่ง ข้อความ และเครดิตของคุณ','Your deliveries, messages and credits')}<small>{t('อัปเดตทุก 10 วินาทีขณะเปิดเว็บ • ล่าสุด 100 รายการ','Updates every 10 seconds while open · Latest 100 items')}</small></p><button className="text-button" disabled={busy||!feed.unread} onClick={()=>void mark(feed.items.filter(i=>!i.read).map(i=>i.id))}><CheckCheck size={16}/>{t('อ่านทั้งหมด','Read all')}</button></div>
 <div className="notification-filters" aria-label={t('กรองการแจ้งเตือน','Filter notifications')}>{[['all','ทั้งหมด','All'],['unread','ยังไม่อ่าน','Unread'],['job','งานขนส่ง','Deliveries'],['message','ข้อความ','Messages'],['wallet','กระเป๋าเงิน','Wallet']].map(([value,th,en])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{t(th,en)}{value==='unread'&&` (${feed.unread})`}</button>)}</div>
 {error&&<div className="notice" role="alert">{t('โหลดหรือบันทึกการแจ้งเตือนไม่สำเร็จ','Unable to load or save notifications')} <button className="text-button" onClick={()=>void refresh()}>{t('ลองอีกครั้ง','Retry')}</button></div>}
 {loading?<p role="status">{t('กำลังโหลด…','Loading…')}</p>:items.length?<ul className="notification-list">{items.map(item=>{const Icon=item.kind==='message'?MessageSquare:item.kind==='wallet'?Wallet:Package;return <li key={item.id}><button className={`notification-entry ${item.read?'':'unread'}`} disabled={busy} onClick={async()=>{if(!item.read&&!await mark([item.id]))return;setOpen(false);onOpen(item);}}><span className={`notification-symbol ${item.kind}`}><Icon size={19}/></span><span className="notification-copy"><strong>{t(item.title,item.titleEn)}{!item.read&&<span className="notification-dot" aria-label={t('ยังไม่อ่าน','Unread')}/>}</strong><span>{t(item.detail,item.detailEn)}</span><time dateTime={item.at}>{new Date(item.at).toLocaleString(t('th-TH','en-GB'),{dateStyle:'medium',timeStyle:'short'})}</time></span><ChevronRight size={16}/></button></li>;})}</ul>:<div className="empty"><Bell size={32}/><h3>{t('ไม่มีการแจ้งเตือนในหมวดนี้','No notifications here')}</h3><p>{t('เมื่อมีความคืบหน้า รายการจะแสดงที่นี่','Updates will appear here when available.')}</p></div>}
 </Modal>}</>;
}
