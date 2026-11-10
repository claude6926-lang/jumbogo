import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testJobAllowed,testRequestAllowed} from '../src/lib/test-accounts';
test('QA drivers and real drivers cannot cross job scopes',()=>{
 assert.equal(testJobAllowed('qa-driver-jumbogo','real-job'),false);
 assert.equal(testJobAllowed('real-driver','qa-trip-one'),false);
 assert.equal(testJobAllowed('qa-driver-jumbogo','qa-trip-one'),true);
 assert.equal(testJobAllowed('real-driver','real-job'),true);
});
test('QA request scope blocks payments, withdrawal, document approval and board writes',()=>{
 for(const path of ['/api/wallet-payments/beam/create','/api/driver/withdraw','/api/auth/application','/api/jobs/one/accept','/api/v1/jobs','/api/v1/profile'])assert.equal(testRequestAllowed(path,'POST'),false,path);
 assert.equal(testRequestAllowed('/api/v1/jobs/qa-trip-one/status','POST'),true);
 assert.equal(testRequestAllowed('/api/v1/jobs/real-job/status','POST'),false);
 assert.equal(testRequestAllowed('/api/maps/config','GET'),true);
 assert.equal(testRequestAllowed('/api/driver/location/qa-trip-one','POST'),true);
});
