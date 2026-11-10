import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
process.env.DATABASE_PATH=':memory:';process.env.TURSO_DATABASE_URL='';process.env.DEMO_MODE='false';process.env.DOCUMENT_ENCRYPTION_KEY='d'.repeat(64);
test('admin live roles rotate sessions, preserve identity, restore admin and deny forged privileges',async()=>{
 const {db}=await import('../src/lib/server/db');const auth=await import('../src/lib/server/auth-store');const {POST}=await import('../src/app/api/admin-role/route');
 for(const [id,role]of [['root','admin'],['customer','user']]){await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(id,id,'',role);await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(id,id,Date.now()+60000);}
 const request=(token:string,role:string,origin='http://localhost:3000')=>new NextRequest('http://localhost:3000/api/admin-role',{method:'POST',headers:{origin,host:'localhost:3000',cookie:'jumbo_session='+token,'Content-Type':'application/json'},body:JSON.stringify({role})});
 assert.equal((await POST(request('customer','admin'))).status,403);assert.equal((await POST(request('root','driver','https://evil.example'))).status,403);
 const r=await POST(request('root','driver'));assert.equal(r.status,200);const token=r.cookies.get('jumbo_session')!.value;assert.notEqual(token,'root');assert.equal(await auth.sessionForToken('root'),null);
 const driver=(await auth.sessionForToken(token))!;assert.equal(driver.role,'driver');assert.equal(driver.id,'root');assert.equal(driver.adminAccount,true);assert.equal(await auth.driverApproved(driver),true);
 assert.equal(await auth.isAdminDriver({id:'customer',role:'driver',name:'',phone:'',adminAccount:true}),false);
 const back=await POST(request(token,'admin'));assert.equal(back.status,200);assert.equal((await auth.sessionForToken(back.cookies.get('jumbo_session')!.value))?.role,'admin');assert.equal(await auth.sessionForToken(token),null);
 const business=await POST(request(back.cookies.get('jumbo_session')!.value,'business'));assert.equal(business.status,200);assert.equal((await business.json()).next,'/company');const businessUser=(await auth.sessionForToken(business.cookies.get('jumbo_session')!.value))!;assert.equal(businessUser.businessAccount,true);assert.equal(businessUser.role,'user');const c=await import('../src/lib/server/company-store');await c.business(businessUser);
 assert.equal((await db.prepare("SELECT role FROM users WHERE id='root'").get())?.role,'admin');assert.equal((await db.prepare("SELECT id FROM audit WHERE action='ADMIN_ROLE_SWITCH'").all()).length,3);
});
