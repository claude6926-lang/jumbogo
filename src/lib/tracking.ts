import {decodePolyline,type Coordinate,type RoutePreview} from './maps';
export const trackingStatuses=['ARRIVING','ARRIVED_PICKUP','PICKED_UP','IN_TRANSIT','ARRIVED_DROPOFF'];
export function distanceMeters(a:Coordinate,b:Coordinate){const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));}
export function shouldSendLocation(last:{point:Coordinate;sentAt:number}|null,point:Coordinate,now:number){if(!last)return true;const elapsed=now-last.sentAt;return elapsed>=5000&&(elapsed>=10000||distanceMeters(last.point,point)>=20);}
// Approximation from the stored route, without requesting Google on GPS changes.
export function arrivalSeconds(route:RoutePreview|null,position:(Coordinate&{at:string;accuracy:number})|null,status:string,now:number):number|null{
 if(!route||!position||!trackingStatuses.includes(status)||now-Date.parse(position.at)>60000||position.accuracy>200)return null;
 if(status==='ARRIVED_PICKUP'||status==='ARRIVED_DROPOFF')return 0;
 const speed=route.distanceMeters/Math.max(1,route.durationSeconds);if(speed<=0)return null;
 if(status==='ARRIVING')return Math.ceil(distanceMeters(position,route.points[0])/speed);
 const path=decodePolyline(route.polyline);if(path.length<2)return null;
 let total=0,nearest=Infinity,progress=0;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],scale=Math.cos(position.lat*Math.PI/180),x=(b.lng-a.lng)*scale,y=b.lat-a.lat,px=(position.lng-a.lng)*scale,py=position.lat-a.lat;const f=Math.max(0,Math.min(1,(px*x+py*y)/(x*x+y*y||1))),projection={lat:a.lat+f*(b.lat-a.lat),lng:a.lng+f*(b.lng-a.lng)};const distance=distanceMeters(position,projection),segment=distanceMeters(a,b);if(distance<nearest){nearest=distance;progress=total+segment*f;}total+=segment;}
 // Off-route GPS does not produce a misleading ETA.
 if(nearest>1000||total===0)return null;
 return Math.ceil(route.durationSeconds*Math.max(0,1-progress/total));
}
