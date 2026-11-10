import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_PATH=':memory:';process.env.TURSO_DATABASE_URL='';process.env.DEMO_MODE='false';process.env.DOCUMENT_ENCRYPTION_KEY='a'.repeat(64);
test('Beam finance is admin-only and converts actual provider satang to baht',async()=>{
 const {db}=await import('../src/lib/server/db');const {beamFinance}=await import('../src/lib/server/beam-finance');
 const user={id:'finance-user',name:'fixture',phone:'',role:'user' as const};
 await assert.rejects(beamFinance(user),/FORBIDDEN/);
 await db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(user.id,user.name,'',user.role);
 const now=new Date().toISOString();await db.prepare("INSERT INTO beam_wallet_payments(id,user_id,amount,status,idem,charge_id,created_at,expires_at,confirmed_at) VALUES(?,?,100,'SUCCEEDED',?,?,?,?,?)").run('finance-payment',user.id,'finance-idem','ch_finance',now,now,now);
 process.env.BEAM_MERCHANT_ID='fixture';process.env.BEAM_API_KEY='fixture';const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{assert.equal(String(url),'https://api.beamcheckout.com/api/v1/transactions?limit=100&offset=0');return Response.json({data:[{transactionId:'ch_finance',transactionType:'PAYMENT',grossAmount:10000,feeAmount:100,vatAmount:7,netAmount:9893,privateField:'not returned'}]});};
 try{const data=await beamFinance({...user,role:'admin'});assert.deepEqual(data.summary,{gross:100,fees:1.07,net:98.93});assert.equal(JSON.stringify(data).includes('privateField'),false);assert.equal(data.payments[0].qr,undefined);}finally{globalThis.fetch=original;}
});
