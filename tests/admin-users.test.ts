import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Session} from '../src/lib/domain';
test('admin user management protects access, financial history and credentials',async()=>{
 process.env.DATABASE_PATH=':memory:';process.env.TURSO_DATABASE_URL='';process.env.DEMO_MODE='false';
 const {db}=await import('../src/lib/server/db');
 const {manageUser}=await import('../src/lib/server/admin-store');
 const {hashPassword,checkPassword}=await import('../src/lib/server/auth-store');
 const admin:Session={id:'admin-test',role:'admin',name:'Admin',phone:''};
 const customer:Session={id:'customer-test',role:'user',name:'Customer',phone:''};
 const password='AdminTestOnly123!';
 for(const u of [admin,customer]){await db.prepare('INSERT INTO users VALUES(?,?,?,?,1)').run(u.id,u.name,u.phone,u.role);await db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?)').run(u.id,u.id+'@example.test',null,u.role,await hashPassword(password),new Date().toISOString());}
 await assert.rejects(manageUser(customer,customer.id,{action:'edit',name:'Updated',phone:'0812345678'}),/FORBIDDEN/);
 await assert.rejects(manageUser(admin,admin.id,{action:'edit',name:'Updated',phone:'0812345678'}),/ADMIN_ACCOUNT_PROTECTED/);
 await manageUser(admin,customer.id,{action:'edit',name:'Updated',phone:'0812345678'});
 assert.equal((await db.prepare('SELECT name FROM users WHERE id=?').get(customer.id))?.name,'Updated');
 await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('old-session',customer.id,Date.now()+60000);
 await assert.rejects(manageUser(admin,customer.id,{action:'password',password:'NewPassword123!',adminPassword:'wrong'}),/ADMIN_PASSWORD_INVALID/);
 await manageUser(admin,customer.id,{action:'password',password:'NewPassword123!',adminPassword:password});
 assert.equal(await checkPassword('NewPassword123!',(await db.prepare('SELECT password_hash FROM accounts WHERE user_id=?').get(customer.id))!.password_hash as string),true);
 assert.equal(await db.prepare('SELECT token FROM sessions WHERE user_id=?').get(customer.id),undefined);
 const at=new Date().toISOString();await db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run('credit',customer.id,100,'WELCOME',null,'credit',at);
 await assert.rejects(manageUser(admin,customer.id,{action:'delete',confirmation:'DELETE',adminPassword:password}),/ACCOUNT_HAS_OBLIGATIONS/);
 await db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run('debit',customer.id,-100,'ADMIN_ADJUSTMENT',null,'debit',at);
 await manageUser(admin,customer.id,{action:'delete',confirmation:'DELETE',adminPassword:password});
 assert.equal(await db.prepare('SELECT user_id FROM accounts WHERE user_id=?').get(customer.id),undefined);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE user_id=?').get(customer.id))?.n,2);
 const audit=await db.prepare("SELECT detail FROM audit WHERE action LIKE 'ADMIN_USER_%'").all();assert.equal(audit.length,3);assert.equal(JSON.stringify(audit).includes(password),false);
});
