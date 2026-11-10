'use client';
import {useEffect,useRef,useState} from 'react';
import type {Job} from '@/lib/domain';
import {shouldSendLocation,trackingStatuses} from '@/lib/tracking';
import type {Coordinate} from '@/lib/maps';
import {useText} from '@/lib/i18n';
export function DriverTracking({jobs,userId}:{jobs:Job[];userId:string}){
 const t=useText();const job=jobs.find(j=>j.driverId===userId&&trackingStatuses.includes(j.status));
 const [consentedJob,setConsentedJob]=useState<string|null>(null),[error,setError]=useState('');
 const last=useRef<{point:Coordinate;sentAt:number}|null>(null),jobId=job?.id;
 useEffect(()=>{last.current=null;setError('');if(!jobId||consentedJob!==jobId)return;
  if(!navigator.geolocation){setError('อุปกรณ์ไม่รองรับตำแหน่ง / Location unavailable');return;}
  const abort=new AbortController();let sending=false,ended=false;
  const stop=()=>{ended=true;navigator.geolocation.clearWatch(watch);};
  const watch=navigator.geolocation.watchPosition(position=>{
   const point={lat:position.coords.latitude,lng:position.coords.longitude};
   if(ended||sending||!shouldSendLocation(last.current,point,Date.now()))return;
   sending=true;void fetch('/api/driver/location/'+encodeURIComponent(jobId),{method:'POST',signal:abort.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({...point,accuracy:position.coords.accuracy,capturedAt:position.timestamp,consent:true})}).then(async r=>{if(ended)return;if(!r.ok){const data=await r.json();if(data.error==='INVALID_TRANSITION'||r.status===403){stop();setConsentedJob(null);}throw new Error();}last.current={point,sentAt:Date.now()};setError('');}).catch(()=>{if(!ended)setError('ส่งตำแหน่งไม่ได้ กรุณาตรวจอินเทอร์เน็ต / Unable to send location');}).finally(()=>{sending=false;});
  },()=>{if(!ended)setError('โปรดอนุญาต GPS แล้วหยุดและเปิดแชร์ใหม่ / Allow GPS and restart sharing');},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  // Server status polling detects completion even while this tab is hidden.
  const check=setInterval(()=>{void fetch('/api/driver/job/'+encodeURIComponent(jobId),{signal:abort.signal,cache:'no-store'}).then(async r=>{if(!r.ok){if(r.status===403){stop();setConsentedJob(null);}return;}const data=await r.json();if(!trackingStatuses.includes(data.status)){stop();setConsentedJob(null);}}).catch(()=>{});},5000);
  return()=>{stop();clearInterval(check);abort.abort();};
 },[jobId,consentedJob]);
 if(!job)return null;
 const sharing=consentedJob===job.id;
 return <section className="panel" role="region" aria-label={t('แชร์ตำแหน่งงานปัจจุบัน','Current delivery location sharing')}><strong>{t('ติดตามรถของงานปัจจุบัน','Current delivery tracking')}</strong><p className="muted">{t('เมื่อยอมรับ ระบบจะส่ง GPS ให้ลูกค้าของงานนี้เท่านั้นระหว่างดำเนินงาน และหยุดเมื่องานจบหรือยกเลิก ปิดเว็บหรือพักแอปอาจทำให้การติดตามหยุด','With your consent, GPS is shared only with this delivery’s customer during the active job. Sharing stops on completion or cancellation. Closing or backgrounding the browser may interrupt tracking.')}</p><button className="button secondary" onClick={()=>{setError('');setConsentedJob(sharing?null:job.id);}}>{sharing?t('หยุดแชร์ตำแหน่ง','Stop sharing'):t('ยินยอมและเริ่มแชร์ตำแหน่ง','Agree and start sharing')}</button>{error&&<p role="alert">{error}</p>}</section>;
}
