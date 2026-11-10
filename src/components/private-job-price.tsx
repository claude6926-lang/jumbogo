'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {useText} from '@/lib/i18n';
import './private-job-price.css';
export function PrivateJobPrice({enabled,viewerId,jobId,children}:{enabled:boolean;viewerId:string;jobId:string;children:ReactNode}){
 const t=useText();const[visible,setVisible]=useState(false);
 useEffect(()=>{
  const sync=()=>setVisible(document.visibilityState==='visible'&&document.hasFocus());
  const hide=()=>setVisible(false);
  sync();document.addEventListener('visibilitychange',sync);window.addEventListener('focus',sync);window.addEventListener('blur',hide);
  return()=>{document.removeEventListener('visibilitychange',sync);window.removeEventListener('focus',sync);window.removeEventListener('blur',hide);};
 },[]);
 if(!enabled)return <>{children}</>;
 return <div className="private-job-price" onCopy={e=>e.preventDefault()}>
  <div className="private-price-content">{visible?<>{children}<small className="price-watermark">JUMBO GO · {viewerId.slice(0,8)} · {jobId.slice(0,8)}</small></>:<span>{t('กลับมาที่หน้านี้เพื่อดูราคา','Return to this page to view the price')}</span>}</div>
  <span className="private-price-print">{t('ซ่อนราคางาน','Job price hidden')}</span>
 </div>;
}
