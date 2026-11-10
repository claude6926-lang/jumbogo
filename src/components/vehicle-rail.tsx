'use client';
import {useRef} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {useText} from '@/lib/i18n';
import './vehicle-rail.css';
type RailItem={id:string;name:string;image:string};
// Adapted from the supplied product rail: selected item faces forward.
export function VehicleRail({items,selected,onSelect}:{items:RailItem[];selected:string;onSelect:(id:string)=>void}){
 const t=useText(),buttons=useRef<(HTMLButtonElement|null)[]>([]);
 function choose(index:number,focus=false){const next=(index+items.length)%items.length;onSelect(items[next].id);if(focus)buttons.current[next]?.focus({preventScroll:true});buttons.current[next]?.scrollIntoView({block:'nearest',inline:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 return <div className="vehicle-rail"><div className="vehicle-rail-controls"><p>{t('เลือกรถเพื่อดูรายละเอียด','Select a vehicle to explore')}</p><div><button type="button" aria-label={t('รถก่อนหน้า','Previous vehicle')} onClick={()=>choose(items.findIndex(v=>v.id===selected)-1)}><ChevronLeft size={18}/></button><button type="button" aria-label={t('รถถัดไป','Next vehicle')} onClick={()=>choose(items.findIndex(v=>v.id===selected)+1)}><ChevronRight size={18}/></button></div></div><div className="vehicle-rail-track" role="tablist" aria-label={t('ประเภทรถ','Vehicle types')}>{items.map((item,index)=><button ref={node=>{buttons.current[index]=node;}} key={item.id} type="button" role="tab" id={'tab-'+item.id} aria-controls="vehicle-panel" aria-selected={selected===item.id} tabIndex={selected===item.id?0:-1} onClick={()=>choose(index)} onKeyDown={event=>{const next=event.key==='ArrowRight'?index+1:event.key==='ArrowLeft'?index-1:event.key==='Home'?0:event.key==='End'?items.length-1:null;if(next===null)return;event.preventDefault();choose(next,true);}}><span className="vehicle-rail-photo"><img src={item.image} alt="" width={400} height={300} loading="lazy"/></span><span className="vehicle-rail-caption"><small>{String(index+1).padStart(2,'0')}</small><strong>{item.name}</strong></span></button>)}</div></div>;
}
