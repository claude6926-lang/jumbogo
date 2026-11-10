import {z} from 'zod';
export const coordinateSchema=z.object({lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180)});
export type Coordinate=z.infer<typeof coordinateSchema>;
export type RoutePoint=Coordinate&{address:string;placeId?:string};
export type RoutePreview={points:RoutePoint[];distanceMeters:number;durationSeconds:number;polyline:string};
export function navigationUrl(destination:string,point?:Coordinate,waypoints:Coordinate[]=[]){
 const q=new URLSearchParams({api:'1',destination:point?`${point.lat},${point.lng}`:destination,travelmode:'driving',dir_action:'navigate'});
 if(waypoints.length)q.set('waypoints',waypoints.map(p=>`${p.lat},${p.lng}`).join('|'));
 return 'https://www.google.com/maps/dir/?'+q;
}
export function decodePolyline(encoded:string):Coordinate[]{
 const points:Coordinate[]=[];let i=0,lat=0,lng=0;
 const next=()=>{let result=0,shift=0,b:number;do{if(i>=encoded.length||shift>30)throw new Error('INVALID_POLYLINE');b=encoded.charCodeAt(i++)-63;if(b<0||b>63)throw new Error('INVALID_POLYLINE');result|=(b&31)<<shift;shift+=5;}while(b>=32);return result&1?~(result>>1):result>>1;};
 while(i<encoded.length){lat+=next();lng+=next();points.push(coordinateSchema.parse({lat:lat/1e5,lng:lng/1e5}));}return points;
}
