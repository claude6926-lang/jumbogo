import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.VERCEL||process.env.NODE_ENV==='production')throw Error('Sandbox is local development only');
await new Promise((done,reject)=>{const probe=createServer();probe.once('error',()=>reject(Error('Sandbox port 3443 is already in use; existing accounts were not changed')));probe.listen(3443,'127.0.0.1',()=>probe.close(done));});
const env={...process.env,NODE_ENV:'development',JUMBO_TEST_SANDBOX:'true',DATABASE_PATH:resolve(root,'data/test-sandbox.sqlite'),TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:'',DEMO_MODE:'false',ENABLE_DEMO_LOGIN:'false',APP_URL:'http://127.0.0.1:3443',DOCUMENT_ENCRYPTION_KEY:randomBytes(32).toString('hex'),WALLET_PAYMENT_MODE:'demo',SANDBOX_PASSWORD:randomBytes(15).toString('base64url')};
for(const name of ['BEAM_API_KEY','BEAM_MERCHANT_ID','BEAM_WEBHOOK_HMAC_KEY','GOOGLE_MAPS_SERVER_KEY','GOOGLE_MAPS_BROWSER_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','FACEBOOK_APP_ID','FACEBOOK_APP_SECRET','RESEND_API_KEY','OMISE_SECRET_KEY','XENDIT_SECRET_KEY'])env[name]='';
function run(args){return new Promise((resolveRun,reject)=>{const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolveRun():reject(Error('Sandbox process failed: '+code)));});}
await run(['--import','tsx','scripts/seed-test-sandbox.ts']);
console.log('LOCAL TEST ONLY: http://127.0.0.1:3443\nDriver: driver@sandbox.example\nCustomer: user@sandbox.example\nAdmin: admin@sandbox.example\nTemporary password for all three: '+env.SANDBOX_PASSWORD);
await run([createRequire(import.meta.url).resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3443']);
