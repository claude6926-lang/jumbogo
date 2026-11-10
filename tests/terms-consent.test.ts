import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountSchema} from '../src/lib/auth-domain';
import {termsConsentVersion,PRIVACY_VERSION} from '../src/lib/terms';
process.env.TURSO_DATABASE_URL='';
process.env.DATABASE_PATH=':memory:';
test('consent is required and registration stores separate role terms and privacy records',async()=>{
 const {db}=await import('../src/lib/server/db');
 const {createAccount}=await import('../src/lib/server/auth-store');
 for(const role of ['user','driver'] as const){
  const input={name:'Terms QA',email:`terms-${role}@example.test`,phone:role==='user'?'0811111111':'0822222222',role,consent:true};
  assert.equal(accountSchema.safeParse({...input,consent:false}).success,false);
  assert.equal(accountSchema.safeParse({...input,consent:undefined}).success,false);
  const id=await createAccount(accountSchema.parse(input),null);
  const rows=await db.prepare('SELECT version,at FROM consents WHERE user_id=?').all(id);
  assert.deepEqual(rows.map(r=>r.version).sort(),[termsConsentVersion(role),'privacy-'+PRIVACY_VERSION].sort());
  assert(rows.every(r=>Number.isFinite(Date.parse(String(r.at)))));
 }
});
