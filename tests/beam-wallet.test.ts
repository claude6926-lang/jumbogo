import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
process.env.DATABASE_PATH=':memory:';
process.env.TURSO_DATABASE_URL='';
process.env.DEMO_MODE='false';
process.env.DOCUMENT_ENCRYPTION_KEY='a'.repeat(64);
test('Beam recovers the same charge after response validation fails and accepts timezone offsets',async()=>{
 const {db,balance}=await import('../src/lib/server/db');const w=await import('../src/lib/server/beam-wallet');
 process.env.WALLET_PAYMENT_MODE='beam_live';process.env.BEAM_MERCHANT_ID='fixture';process.env.BEAM_API_KEY='fixture';process.env.BEAM_WEBHOOK_HMAC_KEY=Buffer.alloc(32,7).toString('base64');
 const user={id:randomUUID(),name:'recovery',phone:'',role:'user' as const};await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(user.id,user.name,'',user.role);
 const original=globalThis.fetch;const requests:{body:string;key:string}[]=[];const input={amount:20,idem:randomUUID()};
 globalThis.fetch=async(_url,init)=>{requests.push({body:String(init?.body),key:(init?.headers as Record<string,string>)['x-beam-idempotency-key']});return Response.json({chargeId:'ch_recovery',actionRequired:'ENCODED_IMAGE',paymentMethodType:'QR_PROMPT_PAY',encodedImage:{imageBase64Encoded:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64'),expiry:requests.length===1?'invalid':'2026-10-21T19:00:00+07:00'}});};
 try{await assert.rejects(w.createBeam(user,input),/BEAM_RESPONSE_INVALID: encodedImage.expiry/);const pending=(await w.beamList(user)).payments[0];assert.equal(pending.status,'CREATING');const recovered=await w.refreshBeam(user,pending.id);assert.equal(recovered.status,'PENDING');assert.deepEqual(requests[0],requests[1]);assert.equal((await w.beamList(user)).payments.length,1);assert.equal(await balance(user.id),0);}finally{globalThis.fetch=original;}
});
test('Beam real wallet verifies ownership, amount, merchant and signature; duplicate confirmations credit once',async()=>{
 const {db,balance}=await import('../src/lib/server/db');
 const w=await import('../src/lib/server/beam-wallet');
 process.env.WALLET_PAYMENT_MODE='beam_live';process.env.BEAM_MERCHANT_ID='merchant-fixture';process.env.BEAM_API_KEY='fixture';process.env.BEAM_WEBHOOK_HMAC_KEY=Buffer.alloc(32,7).toString('base64');
 const original=globalThis.fetch;
 let reference='',amount=10000,status='PENDING',merchant='merchant-fixture',creates=0;
 globalThis.fetch=async(url,init)=>{assert.ok(String(url).startsWith('https://api.beamcheckout.com/api/v1/charges'));if(init?.method==='POST'){const body=JSON.parse(String(init.body));reference=body.referenceId;creates++;assert.equal(body.amount,10000);assert.equal(body.paymentMethod.paymentMethodType,'QR_PROMPT_PAY');assert.ok((init.headers as Record<string,string>)['x-beam-idempotency-key']);return Response.json({chargeId:'ch_fixture',actionRequired:'ENCODED_IMAGE',paymentMethodType:'QR_PROMPT_PAY',encodedImage:{imageBase64Encoded:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64'),expiry:new Date(Date.now()+600000).toISOString()}});}return Response.json({chargeId:'ch_fixture',merchantId:merchant,referenceId:reference,amount,currency:'THB',status,paymentMethod:{paymentMethodType:'QR_PROMPT_PAY'}});};
 try{for(const role of ['user','driver'] as const){const u={id:role,name:role,phone:'',role};await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(u.id,u.name,'',role);}
 const user={id:'user',name:'user',phone:'',role:'user' as const},driver={id:'driver',name:'driver',phone:'',role:'driver' as const};
 const input={amount:100,idem:randomUUID()};const p=await w.createBeam(user,input);await w.createBeam(user,input);assert.equal(creates,1);assert.equal(await balance(user.id),0);
 await assert.rejects(w.refreshBeam(driver,p.id),/FORBIDDEN/);await assert.rejects(w.createBeam(driver,input),/IDEMPOTENCY_CONFLICT/);
 status='SUCCEEDED';amount=20000;await assert.rejects(w.refreshBeam(user,p.id),/PAYMENT_MISMATCH/);amount=10000;merchant='wrong';await assert.rejects(w.refreshBeam(user,p.id),/PAYMENT_MISMATCH/);merchant='merchant-fixture';
 const raw=Buffer.from(JSON.stringify({chargeId:'ch_fixture',merchantId:merchant,referenceId:reference}));const sig=createHmac('sha256',Buffer.from(process.env.BEAM_WEBHOOK_HMAC_KEY,'base64')).update(raw).digest('base64');
 await assert.rejects(w.beamWebhook(raw,'bad'),/INVALID_SIGNATURE/);assert.equal(await balance(user.id),0);
 await Promise.all([w.beamWebhook(raw,sig),w.refreshBeam(user,p.id),w.beamWebhook(raw,sig)]);assert.equal(await balance(user.id),100);assert.equal((await w.beamList(driver)).payments.length,0);assert.equal((await w.beamReceipt(user,p.id)).testOnly,false);
 const {earnings}=await import('../src/lib/server/driver-store');
 // A driver's collected top-up belongs to credit, not withdrawable job income.
 const driverPaymentId=randomUUID();await db.prepare("INSERT INTO beam_wallet_payments(id,user_id,amount,status,idem,charge_id,created_at,expires_at) VALUES(?,?,?,'PENDING',?,?,?,?)").run(driverPaymentId,driver.id,100,randomUUID(),'ch_driver',new Date().toISOString(),new Date(Date.now()+600000).toISOString());
 globalThis.fetch=async()=>Response.json({chargeId:'ch_driver',merchantId:merchant,referenceId:driverPaymentId,amount:10000,currency:'THB',status:'SUCCEEDED',paymentMethod:{paymentMethodType:'QR_PROMPT_PAY'}});
 await w.refreshBeam(driver,driverPaymentId);assert.equal(await balance(driver.id),100);assert.equal((await earnings(driver.id)).available,0);
 }finally{globalThis.fetch=original;}
});
