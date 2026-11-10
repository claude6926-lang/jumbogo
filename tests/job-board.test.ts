import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {maskPhones,boardShare,parseBoardChat} from '../src/lib/job-board';
import type {Session} from '../src/lib/domain';
process.env.DATABASE_PATH=':memory:';process.env.DEMO_MODE='false';process.env.DOCUMENT_ENCRYPTION_KEY='b'.repeat(64);
test('mask Thai phone formats and copy text without damaging fares, times or ordinary prose',()=>{
 for(const phone of ['0812345678','081-234-5678','081 234 5678','081.234.5678','+66812345678','+66 81 234 5678','+66 (0)81-234-5678','02-123-4567','๐๘๑๒๓๔๕๖๗๘'])assert.equal(maskPhones('โทร'+phone+'ครับ'),'โทร[ติดต่อผ่านระบบ]ครับ',phone);
 const text='รถ 4 ล้อ ราคา 7,000 บาท เวลา 08:00';assert.equal(maskPhones(text),text);
 assert.equal(parseBoardChat('ต้นทาง: กรุงเทพ\nปลายทาง: อยุธยา\nราคา: 7,000 บาท\nโทร0812345678').price_thb,'7000');
});
test('board API enforces privacy, roles, expiry, atomic acceptance and offers',async()=>{
 const {db}=await import('../src/lib/server/db');const {encrypt}=await import('../src/lib/server/auth-store');
 const store=await import('../src/lib/server/job-board-store');const {saveCustomerDetails}=await import('../src/lib/server/customer-details');
 const {GET,POST,PATCH}=await import('../src/app/api/jobs/[[...path]]/route');
 const admin:Session={id:'admin',name:'Admin',phone:'',role:'admin'},poster:Session={id:'poster',name:'Company',phone:'',role:'user'},other:Session={...poster,id:'other'},d1:Session={...poster,id:'d1',role:'driver'},d2:Session={...d1,id:'d2'},wrong:Session={...d1,id:'wrong'},pending:Session={...d1,id:'pending'};
 for(const u of [admin,poster,other,d1,d2,wrong,pending]){await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(u.id,u.name,'',u.role);await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(u.id,u.id,Date.now()+3600000);if(u.role==='driver')await db.prepare('INSERT INTO driver_applications VALUES(?,?,?,NULL,NULL,?)').run(u.id,u.id==='pending'?'PENDING':'APPROVED',encrypt(Buffer.from(JSON.stringify({vehicleType:u.id==='wrong'?'box':'pickup'}))),new Date().toISOString());}
 // Use the persisted existing customer schema, without introducing a new auth role.
 const {customerDetailsSchema}=await import('../src/lib/auth-domain');
 const shape={customerType:'business',companyName:'Test logistics',address:'1 Example Road',subdistrict:'Test',district:'Test',province:'Bangkok',postalCode:'10100'};
 const parsed=customerDetailsSchema.parse(shape);await saveCustomerDetails(poster.id,parsed);
 const payload={vehicle_type:'pickup',job_type:'ขนของ',pickup:'กรุงเทพ โทร0812345678',dropoff:'อยุธยา',scheduled_at:new Date(Date.now()+86400000).toISOString(),helpers_count:1,price_thb:7000,price_note:'รวมยก 081-234-5678',allow_offers:false,body_public:'โทร+66 81 234 5678 <script>alert(1)</script>',contact_phone_private:'0812345678'};
 const request=async(method:string,path:string,user:Session|null,data?:unknown)=>{const req=new NextRequest('http://localhost:3000/api/jobs'+(path?'/'+path:''),{method,headers:{host:'localhost:3000',origin:'http://localhost:3000',...(user?{cookie:'jumbo_session='+user.id}:{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return (method==='GET'?GET:method==='PATCH'?PATCH:POST)(req,{params:Promise.resolve({path:path?path.split('/'):[]})});};
 assert.equal((await request('POST','',null,payload)).status,401);
 assert.equal((await request('POST','',d1,payload)).status,403);
 const individualPosted=await request('POST','',other,payload);assert.equal(individualPosted.status,200);
 const individualFeed=await (await request('GET','',other)).json();assert.equal(individualFeed.canPost,true);assert.equal(individualFeed.isCompany,false);assert.equal(individualFeed.company,undefined);
 const posted=await request('POST','',poster,payload);assert.equal(posted.status,200);const job=await posted.json();
 for(const user of [null,other,d1]){const response=await request('GET',job.id,user);const data=await response.json();assert.equal(data.job.contact_phone_private,undefined);assert.ok(!JSON.stringify(data).includes('0812345678'));}
 assert.equal((await store.boardDetail(job.id,poster)).contact_phone_private,'0812345678');
 assert.equal((await store.boardDetail(job.id,admin)).contact_phone_private,'0812345678');
 assert.ok(!boardShare(job,'https://example.com').includes('0812345678'));assert.ok(boardShare(job,'https://example.com').endsWith('/jobs/'+job.id));
 assert.equal((await request('PATCH',job.id,other,payload)).status,403);
 assert.equal((await request('POST',job.id+'/accept',wrong,{})).status,403);
 assert.equal((await request('POST',job.id+'/accept',pending,{})).status,403);
 const results=await Promise.all([request('POST',job.id+'/accept',d1,{}),request('POST',job.id+'/accept',d2,{})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const accepted=await store.boardDetail(job.id,poster);const winner=accepted.accepted_by==='d1'?d1:d2;
 assert.equal((await store.boardDetail(job.id,winner)).contact_phone_private,'0812345678');process.env.JOB_BOARD_SHARE_ACCEPTED_PHONE='false';assert.equal((await store.boardDetail(job.id,winner)).contact_phone_private,undefined);delete process.env.JOB_BOARD_SHARE_ACCEPTED_PHONE;
 assert.equal((await request('PATCH',job.id,poster,payload)).status,409);
 await store.boardStatus(winner,job.id,'in_progress');await store.boardStatus(winner,job.id,'done');
 const expired=await store.saveBoard(poster,payload);await db.prepare('UPDATE board_jobs SET scheduled_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',expired.id);assert.equal((await store.boardDetail(expired.id,null)).status,'expired');assert.equal((await request('POST',expired.id+'/accept',d1,{})).status,409);
 const offerJob=await store.saveBoard(poster,{...payload,allow_offers:true});await store.offerBoard(d1,offerJob.id,{offer_price_thb:6500});await store.offerBoard(d2,offerJob.id,{offer_price_thb:6600});
 assert.equal((await request('POST',offerJob.id+'/accept',d1,{})).status,403);
 const offers=await Promise.allSettled([store.acceptBoard(poster,offerJob.id,d1.id),store.acceptBoard(poster,offerJob.id,d2.id)]);assert.equal(offers.filter(o=>o.status==='fulfilled').length,1);
 assert.equal((await store.boardOffers(offerJob.id,poster)).filter(o=>o.status==='accepted').length,1);
 assert.ok(!(JSON.stringify(await db.prepare('SELECT detail FROM audit').all())).includes('0812345678'));
});
