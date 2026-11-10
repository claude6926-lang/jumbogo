'use client';
import {useEffect,useRef,useState} from 'react';
import type * as Leaflet from 'leaflet';
import type {Coordinate} from '@/lib/maps';
import {useText} from '@/lib/i18n';
import 'leaflet/dist/leaflet.css';
import './route-map.css';
const empty:Coordinate[]=[];
export default function OpenMap({position,stops=empty,onPick}:{position?:Coordinate|null;stops?:Coordinate[];onPick?:(p:Coordinate)=>void}){
 const t=useText(),host=useRef<HTMLDivElement>(null),map=useRef<Leaflet.Map|null>(null),library=useRef<typeof Leaflet|null>(null),driver=useRef<Leaflet.CircleMarker|null>(null),pick=useRef(onPick);
 const[ready,setReady]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{pick.current=onPick;},[onPick]);
 useEffect(()=>{let alive=true;let resize:ResizeObserver|undefined;
 void import('leaflet').then(L=>{if(!alive||!host.current)return;library.current=L;const m=L.map(host.current,{scrollWheelZoom:false}).setView([13.7563,100.5018],11);map.current=m;
 L.tileLayer(process.env.NEXT_PUBLIC_OSM_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',referrerPolicy:'strict-origin-when-cross-origin'}).on('tileerror',()=>{if(alive)setError(true);}).on('tileload',()=>{if(alive)setError(false);}).addTo(m);
 m.on('click',(e:Leaflet.LeafletMouseEvent)=>pick.current?.({lat:e.latlng.lat,lng:e.latlng.lng}));resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(host.current);setReady(true);
 }).catch(()=>{if(alive)setError(true);});return()=>{alive=false;resize?.disconnect();map.current?.remove();map.current=null;driver.current=null;};},[]);
 const stopKey=JSON.stringify(stops);
 useEffect(()=>{if(!ready||!map.current||!library.current)return;const points:Coordinate[]=JSON.parse(stopKey),L=library.current,m=map.current;const group=L.layerGroup().addTo(m);
 points.forEach((p,i)=>L.circleMarker([p.lat,p.lng],{radius:10,color:'#fff',weight:2,fillColor:i===0?'#168653':'#ed0028',fillOpacity:1}).bindTooltip(i===0?'A':String(i),{permanent:true,direction:'top'}).addTo(group));
 if(points.length)m.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lng])),{padding:[40,40],maxZoom:16});return()=>{group.remove();};},[ready,stopKey]);
 useEffect(()=>{if(!ready||!map.current||!library.current)return;if(!position){driver.current?.remove();driver.current=null;return;}
 const latlng:Leaflet.LatLngTuple=[position.lat,position.lng];if(driver.current)driver.current.setLatLng(latlng);else{driver.current=library.current.circleMarker(latlng,{radius:11,color:'#fff',weight:3,fillColor:'#1769ff',fillOpacity:1}).bindTooltip('GPS',{permanent:true,direction:'top'}).addTo(map.current);if(!stops.length)map.current.setView(latlng,15);}
 },[position,ready,stops.length]);
 return <div className="real-map-wrap open-map-wrap"><div ref={host} className="real-map osm-map" aria-label={t('แผนที่จริง OpenStreetMap','OpenStreetMap map')}/>{!ready&&!error&&<p className="map-hint" role="status">{t('กำลังโหลดแผนที่จริง…','Loading map…')}</p>}{error&&<p className="map-hint" role="alert">{t('โหลดแผนที่บางส่วนไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองเปิดหน้านี้ใหม่','Some map tiles could not load. Check your connection and reopen this view.')}</p>}{position&&<button type="button" className="button secondary small" onClick={()=>map.current?.setView([position.lat,position.lng],15)}>{t('ดูตำแหน่งคนขับ','Center on driver')}</button>}<p className="map-hint">{onPick?t('แตะบนแผนที่เพื่อเลือกหมุด แล้วกดยืนยัน','Tap the map to choose a pin, then confirm'):t('แผนที่จริง • หมุดสีน้ำเงินคือตำแหน่ง GPS ล่าสุด','Live map tiles • Blue marker is the latest GPS location')}</p></div>;
}
