import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
process.env.DATABASE_PATH=':memory:';process.env.TURSO_DATABASE_URL='';process.env.DEMO_MODE='false';process.env.DOCUMENT_ENCRYPTION_KEY='a'.repeat(64);
test('Premium locks 199, confirms once, renews 30 days, protects ownership and never credits wallet',async()=>{
 const {db,balance}=await import('../src/lib/server/db');const p=await import('../src/lib/server/premium-payments');const {saveCustomerDetails}=await import('../src/lib/server/customer-details');const {customerDetailsSchema}=await import('../src/lib/auth-domain');
 const u={id:randomUUID(),name:'Business',phone:'',role:'user' as const};await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(u.id,u.name,'',u.role);
 await saveCustomerDetails(u.id,customerDetailsSchema.parse({customerType:'business',companyName:'Test',address:'1 Example Road',subdistrict:'Test',district:'Test',province:'Bangkok',postalCode:'10100'}));
 process.env.BEAM_MERCHANT_ID='fixture';process.env.BEAM_API_KEY='fixture';process.env.BEAM_WEBHOOK_HMAC_KEY=Buffer.alloc(32,7).toString('base64');
 let reference='',amount=19900,status='PENDING',creates=0;const original=globalThis.fetch;
 globalThis.fetch=async(_url,init)=>{if(init?.method==='POST'){const body=JSON.parse(String(init.body));assert.equal(body.amount,19900);assert.match(body.returnUrl,/\/premium$/);reference=body.referenceId;creates++;return Response.json({chargeId:'ch_'+creates,actionRequired:'ENCODED_IMAGE',paymentMethodType:'QR_PROMPT_PAY',encodedImage:{imageBase64Encoded:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64'),expiry:new Date(Date.now()+600000).toISOString()}});}return Response.json({chargeId:'ch_'+creates,referenceId:reference,merchantId:'fixture',amount,currency:'THB',status,paymentMethod:{paymentMethodType:'QR_PROMPT_PAY'}});};
 try{await assert.rejects(p.createPremiumPayment(u,{idem:randomUUID(),amount:1}));const first=await p.createPremiumPayment(u,{idem:randomUUID()});assert.equal(first.amount,199);assert.equal((await p.createPremiumPayment(u,{idem:randomUUID()})).id,first.id);assert.equal(creates,1);
 await assert.rejects(p.refreshPremiumPayment({...u,id:'other'},first.id));assert.equal(await db.prepare('SELECT * FROM company_memberships WHERE user_id=?').get(u.id),undefined);
 status='SUCCEEDED';amount=1;await assert.rejects(p.refreshPremiumPayment(u,first.id));amount=19900;
 const raw=Buffer.from(JSON.stringify({referenceId:first.id,chargeId:'ch_1',merchantId:'fixture'}));const sig=createHmac('sha256',Buffer.from(process.env.BEAM_WEBHOOK_HMAC_KEY,'base64')).update(raw).digest('base64');await assert.rejects(p.premiumWebhook(raw,'bad'));
 await Promise.all([p.refreshPremiumPayment(u,first.id),p.premiumWebhook(raw,sig)]);const m=await db.prepare('SELECT * FROM company_memberships WHERE user_id=?').get(u.id);assert.ok(Math.abs(Date.parse(String(m?.expires_at))-Date.now()-30*86400000)<5000);assert.equal(await balance(u.id),0);
 const second=await p.createPremiumPayment(u,{idem:randomUUID()});await p.refreshPremiumPayment(u,second.id);const renewed=await db.prepare('SELECT * FROM company_memberships WHERE user_id=?').get(u.id);assert.equal(Date.parse(String(renewed?.expires_at))-Date.parse(String(m?.expires_at)),30*86400000);assert.equal(await balance(u.id),0);
 }finally{globalThis.fetch=original;}
});
