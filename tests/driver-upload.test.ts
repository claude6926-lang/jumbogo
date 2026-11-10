import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import sharp from 'sharp';
process.env.DATABASE_PATH=':memory:';
process.env.DEMO_MODE='false';
process.env.DOCUMENT_ENCRYPTION_KEY='e'.repeat(64);
test('individual driver uploads remain private and cannot change an application submitted for review',async()=>{
 const {db}=await import('../src/lib/server/db');
 const {POST,GET}=await import('../src/app/api/auth/[...path]/route');
 for(const id of ['driver','other']){
  await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(id,id,'','driver');
  await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(id,id,Date.now()+60000);
  await db.prepare("INSERT INTO driver_applications VALUES(?,'DRAFT',NULL,NULL,NULL,?)").run(id,new Date().toISOString());
 }
 const image=await sharp({create:{width:10,height:10,channels:3,background:'red'}}).png().toBuffer();
 const {documentKinds}=await import('../src/lib/auth-domain');const kind=documentKinds[0];
 const upload=()=>{const body=new FormData();body.set('documentConsent','true');body.set('image',new File([new Uint8Array(image)],'test.png',{type:'image/png'}));return POST(new NextRequest('https://app.example.com/api/auth/application/document/'+kind,{method:'POST',headers:{host:'app.example.com',origin:'https://app.example.com',cookie:'jumbo_session=driver'},body}),{params:Promise.resolve({path:['application','document',kind]})});};
 assert.equal((await upload()).status,200);
 const row=await db.prepare('SELECT id FROM driver_documents WHERE user_id=?').get('driver');assert(row);
 const read=await GET(new NextRequest('https://app.example.com/api/auth/document/'+row.id,{headers:{cookie:'jumbo_session=other'}}),{params:Promise.resolve({path:['document',String(row.id)]})});
 assert.equal(read.status,403);
 await db.prepare("UPDATE driver_applications SET status='PENDING' WHERE user_id='driver'").run();
 assert.equal((await upload()).status,409);
 assert.equal((await db.prepare('SELECT count(*) n FROM driver_documents').get())?.n,1);
});
