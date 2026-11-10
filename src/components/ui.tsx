'use client';
import {useCms} from '@/lib/cms-context';
import {useEffect,useRef,type ReactNode} from 'react';
import {X,Phone,Truck,ArrowUpRight} from 'lucide-react';
import {phoneUri,type Job} from '@/lib/domain';
import {useText,statusLabels} from '@/lib/i18n';
export function Brand(){const cms=useCms(),t=useText();return <div className="brand"><img src={cms('brand.logo','/logo.png')} alt="JUMBO GO"/><div><strong>{cms('brand.primary','JUMBO')}<span>{cms('brand.secondary','GO')}</span></strong><small>{t('เรียกรถขนของ ราคาคนไทย','Transport at Thai prices')}</small></div></div>;}
const vehicleImages=['pickup','box','cage','jumbo','six'];
export function VehicleImage({index=0,vehicleId}:{index?:number;vehicleId?:string}){const cms=useCms();const id=vehicleImages.includes(vehicleId||'')?vehicleId:vehicleImages[index]||'pickup';return <div className="vehicle-image" aria-hidden="true"><img src={cms('fleet.image.'+id,`/vehicles/${id}.png`)} alt="" decoding="async"/></div>;}
export function StatusPill({status}:{status:string}){const t=useText();return <span className={`status status-${status.toLowerCase()}`}><i/>{t(...(statusLabels[status]||[status,status]))}</span>;}
export function CallDriver({phone,compact=false}:{phone?:string;compact?:boolean}){const t=useText();const href=phone?phoneUri(phone):null;return href?<a className={compact?'icon-button call-button':'button secondary'} href={href} aria-label={t('โทรหาคนขับ เปิดแอปโทรศัพท์','Call driver in phone app')} title={t('เปิดเบอร์ในแอปโทรศัพท์','Open number in phone app')}><Phone size={18}/>{!compact&&t('โทรหาคนขับ','Call driver')}</a>:<button className="icon-button" disabled title={t('คนขับยังไม่ได้รับงาน','No driver assigned')}><Phone size={18}/></button>;}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();},[]);return <dialog ref={ref} className="modal" onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="modal-head"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close / ปิด"><X size={20}/></button></div>{children}</dialog>;}
export function Empty({title,detail,action}:{title:string;detail:string;action?:ReactNode}){return <div className="empty"><div className="empty-icon"><Truck size={32}/></div><h3>{title}</h3><p>{detail}</p>{action}</div>;}
export function JobRoute({job}:{job:Job}){return <div className="job-route"><div><i className="point green"/><span>{job.pickup}</span></div>{job.drops.map((drop,i)=><div key={i}><i className="point red"/><span>{drop}</span></div>)}</div>;}
export function SectionTitle({title,action,onClick}:{title:string;action?:string;onClick?:()=>void}){return <div className="section-title"><h2>{title}</h2>{action&&<button className="text-button" onClick={onClick}>{action}<ArrowUpRight size={16}/></button>}</div>;}
