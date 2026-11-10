'use client';
import {useEffect,useRef,useState} from 'react';
import {MapPin} from 'lucide-react';
import {loadGoogleMaps} from '@/lib/google-maps-client';
import {decodePolyline,type Coordinate,type RoutePreview} from '@/lib/maps';
import {useText} from '@/lib/i18n';
import './route-map.css';
import dynamic from 'next/dynamic';
const OpenMap=dynamic(()=>import('./open-map'),{ssr:false});
export function RealMap({route,position,pickup,drop,stops,onPick}:{route?:RoutePreview|null;position?:Coordinate|null;pickup?:string;drop?:string;stops?:Coordinate[];onPick?:(point:Coordinate)=>void}){
 const t=useText(),host=useRef<HTMLDivElement>(null),map=useRef<google.maps.Map|null>(null),driver=useRef<google.maps.marker.AdvancedMarkerElement|null>(null);
 const[ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let alive=true;const failed=()=>setError('MAP_LOAD_FAILED');window.addEventListener('jumbo-map-auth-error',failed);setError('');
 void loadGoogleMaps().then(()=>{if(!alive||!host.current)return;map.current=new google.maps.Map(host.current,{center:{lat:13.7563,lng:100.5018},zoom:11,mapId:'DEMO_MAP_ID',mapTypeControl:false,streetViewControl:false,fullscreenControl:true,gestureHandling:'cooperative'});setReady(true);}).catch(e=>{if(alive)setError(e.message);});
 return()=>{alive=false;window.removeEventListener('jumbo-map-auth-error',failed);driver.current=null;map.current=null;};},[attempt]);
 useEffect(()=>{if(!ready||!map.current||!route)return;const current=map.current;const line=new google.maps.Polyline({path:decodePolyline(route.polyline),strokeColor:'#ed0028',strokeWeight:5,map:current});const bounds=new google.maps.LatLngBounds();
 const markers=route.points.map((p,i)=>{bounds.extend(p);const pin=new google.maps.marker.PinElement({glyphText:i===0?'A':String(i),background:i===0?'#198754':'#ed0028',glyphColor:'white',borderColor:'white'});return new google.maps.marker.AdvancedMarkerElement({map:current,position:p,title:p.address,content:pin.element});});
 current.fitBounds(bounds,45);return()=>{line.setMap(null);markers.forEach(m=>m.map=null);};},[route,ready]);
 useEffect(()=>{if(!ready||!map.current)return;if(!position){if(driver.current)driver.current.map=null;driver.current=null;return;}
 if(driver.current)driver.current.position=position;else{const pin=new google.maps.marker.PinElement({glyphText:'รถ',background:'#1769ff',glyphColor:'white'});driver.current=new google.maps.marker.AdvancedMarkerElement({map:map.current,position,title:'ตำแหน่งคนขับ / Driver location',content:pin.element});if(!route){map.current.setCenter(position);map.current.setZoom(15);}}
 },[position,ready,route]);
 useEffect(()=>{if(!ready||!map.current||route)return;const current=map.current;const bounds=new google.maps.LatLngBounds();const markers=(stops||[]).map((p,i)=>{bounds.extend(p);return new google.maps.marker.AdvancedMarkerElement({map:current,position:p,title:i===0?'จุดรับ / Pickup':`จุดส่ง / Drop-off ${i}`});});if(markers.length===1){current.setCenter(stops![0]);current.setZoom(15);}else if(markers.length)current.fitBounds(bounds,45);return()=>markers.forEach(m=>m.map=null);},[stops,ready,route]);
 useEffect(()=>{if(!ready||!map.current||!onPick)return;const listener=map.current.addListener('click',(event:google.maps.MapMouseEvent)=>{if(event.latLng)onPick(event.latLng.toJSON());});return()=>listener.remove();},[ready,onPick]);
 if(error==='MAP_PROVIDER_NOT_CONFIGURED')return <OpenMap position={position} stops={stops} onPick={onPick}/>;
 return <div className="real-map-wrap"><div className="real-map" ref={host} aria-label={t('แผนที่เส้นทางและตำแหน่ง','Route and location map')}/>{(!ready||error)&&<div className="map-state" role="status"><MapPin/><strong>{error?t('แผนที่ยังไม่พร้อมใช้งาน','Map is not available'):t('กำลังโหลดแผนที่…','Loading map…')}</strong><p>{error?t('ตรวจการเชื่อมต่อและการตั้งค่าแผนที่ แล้วลองอีกครั้ง','Check your connection and map configuration, then retry.'):t('โปรดรอสักครู่','Please wait')}</p>{error&&<button type="button" className="button secondary small" onClick={()=>{setReady(false);setAttempt(n=>n+1);}}>{t('ลองใหม่','Retry')}</button>}</div>}
 {position&&ready&&!error&&<button type="button" className="button secondary small" onClick={()=>{map.current?.setCenter(position);map.current?.setZoom(15);}}>{t('ดูตำแหน่งคนขับ','Center on driver')}</button>}
 {route&&<div className="real-map-summary">{(route.distanceMeters/1000).toFixed(1)} {t('กม.','km')} · {Math.ceil(route.durationSeconds/60)} {t('นาที โดยประมาณ • ไม่รวมเวลาขนของ','min estimated • excludes loading')}</div>}
 {!route&&ready&&!error&&<p className="map-hint">{pickup||drop?t('เลือกพิกัดและกดดูราคาเพื่อแสดงเส้นทาง','Select locations and request a fare to see the route'):t('เลือกจุดรับและจุดส่งเพื่อดูเส้นทาง','Choose pickup and drop-off locations')}</p>}</div>;
}
