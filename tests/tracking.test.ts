import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arrivalSeconds,shouldSendLocation} from '../src/lib/tracking';
process.env.DATABASE_PATH=':memory:';
process.env.TURSO_DATABASE_URL='';
test('daily cleanup removes only coordinates older than thirty days',async()=>{
 const {db}=await import('../src/lib/server/db');
 await db.migrate('CREATE TABLE IF NOT EXISTS delivery_locations(job_id TEXT PRIMARY KEY,lat REAL,lng REAL,accuracy REAL,at TEXT)');
 await db.prepare('INSERT INTO delivery_locations VALUES(?,?,?,?,?)').run('old',13,100,5,new Date(Date.now()-31*86400000).toISOString());
 await db.prepare('INSERT INTO delivery_locations VALUES(?,?,?,?,?)').run('recent',13,100,5,new Date().toISOString());
 await import('../scripts/cleanup-tracking');
 assert.equal(await db.prepare('SELECT job_id FROM delivery_locations WHERE job_id=?').get('old'),undefined);
 assert.ok(await db.prepare('SELECT job_id FROM delivery_locations WHERE job_id=?').get('recent'));
});
test('GPS throttles rapid updates and sends movement or a ten-second heartbeat',()=>{
 const last={point:{lat:13.7,lng:100.5},sentAt:1000};
 assert.equal(shouldSendLocation(null,last.point,1000),true);
 assert.equal(shouldSendLocation(last,{lat:13.71,lng:100.5},5999),false);
 assert.equal(shouldSendLocation(last,{lat:13.7003,lng:100.5},6000),true);
 assert.equal(shouldSendLocation(last,last.point,10999),false);
 assert.equal(shouldSendLocation(last,last.point,11000),true);
});
test('ETA uses cached route geometry and suppresses stale, ended and off-route positions',()=>{
 const now=Date.now(),route={points:[{lat:38.5,lng:-120.2,address:'Pickup'},{lat:43.252,lng:-126.453,address:'Destination'}],distanceMeters:500000,durationSeconds:1000,polyline:'_p~iF~ps|U_ulLnnqC_mqNvxq`@'},location={...route.points[0],at:new Date(now).toISOString(),accuracy:5};
 assert.equal(arrivalSeconds(route,location,'IN_TRANSIT',now),1000);
 assert.equal(arrivalSeconds(route,{...location,...route.points[1]},'IN_TRANSIT',now),0);
 assert.equal(arrivalSeconds(route,location,'ARRIVED_PICKUP',now),0);
 assert.equal(arrivalSeconds(route,location,'COMPLETED',now),null);
 assert.equal(arrivalSeconds(route,location,'IN_TRANSIT',now+60001),null);
 assert.equal(arrivalSeconds(route,{...location,lat:0,lng:0},'IN_TRANSIT',now),null);
 assert.equal(arrivalSeconds(route,{...location,accuracy:201},'IN_TRANSIT',now),null);
});
