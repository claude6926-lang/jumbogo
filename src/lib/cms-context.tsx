'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import type {CmsSnapshot} from './cms-key';
export const CmsContext=createContext<CmsSnapshot>({revision:0,values:{}});
export function ContentProvider({initial,children}:{initial:CmsSnapshot;children:React.ReactNode}){
 const [snapshot,setSnapshot]=useState(initial),[preview,setPreview]=useState(false),[error,setError]=useState('');
 const pathname=usePathname();
 const previewRequest=useRef<{key:string;promise:Promise<CmsSnapshot>}|null>(null);
 useEffect(()=>{setSnapshot(initial);},[initial]);
 useEffect(()=>{const isPreview=new URLSearchParams(window.location.search).get('cmsPreview')==='1';let active=true;setPreview(isPreview);setError('');setSnapshot(initial);if(!isPreview)return;const key=pathname+':'+initial.revision;if(previewRequest.current?.key!==key)previewRequest.current={key,promise:fetch('/api/content?preview=1',{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('ไม่มีสิทธิ์พรีวิวร่าง กรุณาเข้าสู่ระบบผู้ดูแล');return response.json() as Promise<CmsSnapshot>;})};previewRequest.current.promise.then(result=>{if(active)setSnapshot(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[pathname,initial]);
 return <CmsContext.Provider value={snapshot}>{preview&&<div style={{background:'#ffedb3',color:'#322400',padding:12,textAlign:'center',position:'sticky',top:0,zIndex:9999}} role="status">{error||'พรีวิวฉบับร่าง — ยังไม่เผยแพร่'} · <Link href="/admin/content">กลับไปจัดการเนื้อหา</Link></div>}{children}</CmsContext.Provider>;
}
export function useCms(){const {values}=useContext(CmsContext);return useCallback((key:string,fallback:string)=>values[key]??fallback,[values]);}
