import {resolve} from 'node:path';
if(process.env.JUMBO_TEST_SANDBOX!=='true'||process.env.NODE_ENV!=='development'||process.env.VERCEL||process.env.TURSO_DATABASE_URL||resolve(process.env.DATABASE_PATH||'')!==resolve('data/test-sandbox.sqlite'))throw Error('Refusing to seed outside isolated sandbox');
const password=process.env.SANDBOX_PASSWORD;if(!password)throw Error('Missing sandbox password');
const {db,saveJob,audit}=await import('../src/lib/server/db');
const {hashPassword}=await import('../src/lib/server/auth-store');
await import('../src/lib/server/driver-store');
const hash=await hashPassword(password),at=new Date().toISOString();
for(const role of ['user','driver','admin']){
 const id='sandbox-'+role;
 await db.prepare('INSERT INTO users VALUES(?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(id,'[TEST] JUMBO GO '+role,'',role);
 await db.prepare('INSERT INTO accounts VALUES(?,?,NULL,?,?,?) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash').run(id,role+'@sandbox.example',role,hash,at);
}
// This approval exists only in the guarded local fixture DB, with no identity documents.
await db.prepare("INSERT INTO driver_applications VALUES(?,'APPROVED',NULL,?,NULL,?) ON CONFLICT(user_id) DO UPDATE SET status='APPROVED',personal=NULL").run('sandbox-driver','LOCAL TEST FIXTURE — not a verified real driver',at);
await db.prepare('INSERT INTO driver_work VALUES(?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET online=1,vehicle=excluded.vehicle').run('sandbox-driver','pickup',at);
const id='sandbox-trip-'+Date.now();
await saveJob({id,userId:'sandbox-user',driverId:null,pickup:'[TEST] สยามพารากอน',drops:['[TEST] อนุสาวรีย์ชัยสมรภูมิ'],locations:[{lat:13.7463,lng:100.5347},{lat:13.7649,lng:100.5383}],vehicle:'pickup',status:'SEARCHING',fare:{base:250,distance:4,distanceFee:48,helper:0,stops:0,total:298},credit:0,total:298,note:'งานจำลองในฐานข้อมูลทดสอบเท่านั้น เงินสดจำลอง 298 บาท',scheduledAt:null,createdAt:at,history:[{from:null,to:'SEARCHING',at,actor:'sandbox-user'}]});
await audit('sandbox-admin','SANDBOX_SEEDED',{jobId:id});
console.log('Isolated sandbox accounts and sample job ready.');
