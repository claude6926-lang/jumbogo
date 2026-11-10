// Isolated component integration: mock Google/GPS, no credentials or real database.
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const job={id:'tracking-test',driverId:'driver',userId:'customer',status:'IN_TRANSIT',pickup:'Pickup',drops:['Destination'],locations:[{lat:38.5,lng:-120.2},{lat:43.252,lng:-126.453}],vehicle:'pickup',fare:{total:648},total:648,history:[]};
let location=null,status=job.status,writes=0,reads=0,customerReads=0;
const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {DriverTracking} from './src/components/driver-tracking';import {DeliveryOperations} from './src/components/driver-center';import {MapPlaceField} from './src/components/map-place-field';const job=${JSON.stringify(job)};function Fixture(){const[j,setJob]=useState(job),[value,setValue]=useState(''),[point,setPoint]=useState(null);const driver=location.search.includes('driver');return <><MapPlaceField label="Pickup" value={value} point={point} onChange={v=>{setValue(v);setPoint(null);}} onPick={p=>{setPoint(p);setValue(p.address);}}/>{driver?<><DriverTracking jobs={[j]} userId="driver"/><button onClick={async()=>{await fetch('/finish',{method:'POST'});setJob({...j,status:'COMPLETED'});}}>Finish test job</button></>:<DeliveryOperations job={j} driver={false} onRefresh={async()=>{}}/>}</>;}createRoot(document.getElementById('root')).render(<Fixture/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'empty'},plugins:[{name:'fixture-text',setup(b){b.onResolve({filter:/^@\/lib\/i18n$/},()=>({path:'text',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export function useText(){return (th,en)=>en;}export const statusLabels={IN_TRANSIT:['กำลังขนส่ง','In transit']};",loader:'js'}));}}]});
const server=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url.startsWith('/api/driver/location/')){let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);assert.equal(data.consent,true);location={lat:data.lat,lng:data.lng,accuracy:data.accuracy,at:new Date(data.capturedAt).toISOString()};writes++;res.end('{}');}else if(req.url.startsWith('/api/driver/job/')){reads++;res.end(JSON.stringify({status,location,proof:null,customer:null}));}else if(req.url==='/api/maps/config')res.end(JSON.stringify({configured:true,browserKey:'fixture-key'}));else if(req.url.startsWith('/api/maps/job/'))res.end(JSON.stringify({points:job.locations.map((p,i)=>({...p,address:i?'Destination':'Pickup'})),distanceMeters:500000,durationSeconds:1000,polyline:'_p~iF~ps|U_ulLnnqC_mqNvxq`@'}));else if(req.url==='/api/maps/autocomplete')res.end('{"allowed":true}');else if(req.url==='/finish'){status='COMPLETED';res.end('{}');}else if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].text);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];
try{
 const contexts=await Promise.all([browser.newContext(),browser.newContext({extraHTTPHeaders:{'X-Fixture-Role':'customer'}})]);
 for(const context of contexts)await context.addInitScript(()=>{
  window.process={env:{NODE_ENV:'production'}};
  window.suggestions=[];window.fields=[];window.markers=[];window.watchCount=0;window.clearCount=0;window.testNow=Date.now();Date.now=()=>window.testNow;
  navigator.geolocation.watchPosition=cb=>{window.watchCount++;window.gpsCallback=cb;return 1;};navigator.geolocation.clearWatch=()=>{window.clearCount++;window.gpsCallback=null;};
  class Map{setCenter(){}setZoom(){}fitBounds(){}addListener(){return {remove(){}};}}
  class Marker{constructor(options){Object.assign(this,options);window.markers.push(this);}}
  class Pin{constructor(){this.element=document.createElement('div');}}
  window.google={maps:{Map,LatLngBounds:class{extend(){}},Polyline:class{setMap(){}},marker:{AdvancedMarkerElement:Marker,PinElement:Pin},places:{AutocompleteSessionToken:class{},AutocompleteSuggestion:{fetchAutocompleteSuggestions:async request=>{window.suggestions.push(request);return {suggestions:[{placePrediction:{text:{toString:()=> 'Bangkok test'},toPlace:()=>({id:'fixture-place',formattedAddress:'Bangkok test',location:{toJSON:()=>({lat:13.7,lng:100.5})},fetchFields:async options=>window.fields.push(options.fields)})}}]};}}}}};
 });
 const driver=await contexts[0].newPage(),customer=await contexts[1].newPage();
 for(const page of [driver,customer])page.on('pageerror',e=>errors.push(e.message));
 await driver.goto(base+'/?driver');await customer.goto(base+'/?customer');
 if(errors.length)throw new Error(errors.join('\n'));
 await driver.getByRole('button',{name:'Agree and start sharing'}).waitFor();
 assert.equal(await driver.evaluate(()=>window.watchCount),0,'GPS requires consent');
 await driver.getByRole('button',{name:'Agree and start sharing'}).click();
 await driver.waitForFunction(()=>window.gpsCallback);
 await driver.evaluate(()=>window.gpsCallback({coords:{latitude:38.5,longitude:-120.2,accuracy:5},timestamp:Date.now()}));
 await customer.getByText('Latest driver location').waitFor({timeout:10000});assert.equal(writes,1);
 await customer.waitForFunction(()=>window.markers.some(m=>m.title?.includes('Driver location')));
 await driver.evaluate(()=>{window.testNow+=6000;window.gpsCallback({coords:{latitude:38.5003,longitude:-120.2,accuracy:5},timestamp:Date.now()});});
 await customer.waitForFunction(()=>window.markers.some(m=>m.title?.includes('Driver location')&&m.position.lat===38.5003),{},{timeout:10000});assert.equal(writes,2);
 const input=driver.getByRole('textbox',{name:'Pickup'});await input.fill('ab');await driver.waitForTimeout(400);assert.equal(await driver.evaluate(()=>window.suggestions.length),0);
 await input.fill('Bang');await driver.waitForTimeout(150);assert.equal(await driver.evaluate(()=>window.suggestions.length),0,'waits for debounce');await driver.getByRole('button',{name:'Bangkok test',exact:true}).waitFor();await driver.getByRole('button',{name:'Bangkok test',exact:true}).click();
 assert.deepEqual(await driver.evaluate(()=>window.fields[0]),['displayName','formattedAddress','location']);
 await input.fill('Bang again');await driver.getByRole('button',{name:'Bangkok test',exact:true}).waitFor();assert.equal(await driver.evaluate(()=>window.suggestions[0].sessionToken===window.suggestions[1].sessionToken),false,'new session after selecting a place');
 await customer.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await customer.waitForTimeout(300);const beforeHidden=customerReads;await customer.waitForTimeout(5500);assert.equal(customerReads,beforeHidden,'hidden customer tabs stop polling');
 await driver.getByRole('button',{name:'Finish test job'}).click();await driver.waitForFunction(()=>window.clearCount>0);const count=writes;await driver.waitForTimeout(5500);assert.equal(writes,count,'no coordinates after completion');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: two isolated browser contexts, consent, moving marker, GPS throttling, stop-on-completion, autocomplete minimum/debounce and minimal fields. Google and GPS are mocked. Reads: '+reads);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
