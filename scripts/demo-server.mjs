import {createServer as createTcpServer} from 'node:net';
import {createServer as createHttpServer} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const dev=process.argv.includes('--dev');
process.env.NODE_ENV=dev?'development':'production';
require('@next/env').loadEnvConfig(root,dev);
const port=Number(process.env.DEMO_PORT||3000);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid DEMO_PORT');
const origin=`https://127.0.0.1:${port}`;
const authTrace=[];
function traceAuth(req,res,transport){
 if(!dev)return;
 let path;try{path=new URL(req.url||'/',origin).pathname;}catch{return;}
 if(!/^\/(api\/auth\/oauth\/(google|facebook)(\/callback)?|user\/login|user\/home|auth\/complete)$/.test(path))return;
 res.once('finish',()=>{
  let destination='none';const location=res.getHeader('location');
  if(typeof location==='string'){try{const u=new URL(location,origin);destination=u.origin===origin?u.pathname:['accounts.google.com','www.facebook.com'].includes(u.hostname)?u.hostname:'other-origin';}catch{destination='invalid';}}
  authTrace.push({at:new Date().toISOString(),path,transport,canonicalHost:req.headers.host===`127.0.0.1:${port}`,oauthCookie:/(?:^|;\s*)jumbo_oauth=/.test(req.headers.cookie||''),sessionCookie:/(?:^|;\s*)jumbo_session=/.test(req.headers.cookie||''),status:res.statusCode,destination});
  if(authTrace.length>60)authTrace.shift();
  try{const folder=dirname(resolve(process.env.DATABASE_PATH||'./data/jumbogo.db'));mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'oauth-local-diagnostics.json'),JSON.stringify(authTrace,null,2),{mode:0o600});}catch{}
 });
}
process.env.APP_URL=origin;
process.env.ENABLE_DEMO_LOGIN='false';
// Reuse the existing encryption key so existing documents remain readable.
if(!dev&&!process.env.DOCUMENT_ENCRYPTION_KEY){
 const keyPath=join(dirname(resolve(process.env.DATABASE_PATH||'./data/jumbogo.db')),'document-key');
 if(existsSync(keyPath)){
  const key=readFileSync(keyPath);
  if(key.length!==32)throw new Error('Invalid existing document key');
  process.env.DOCUMENT_ENCRYPTION_KEY=key.toString('hex');
 }else throw new Error('Document encryption key missing. Configure DOCUMENT_ENCRYPTION_KEY before starting.');
}
if(!dev&&!existsSync('.next/BUILD_ID'))throw new Error('Production build missing. Run npm run build first.');
const key=readFileSync('certificates/localhost-key.pem');
const cert=readFileSync('certificates/localhost.pem');
const next=require('next');
const app=next({dev,dir:root,hostname:'127.0.0.1',port});
let handler=(_req,res)=>{res.writeHead(503,{'Retry-After':'2'});res.end('Starting JUMBO GO. Please retry shortly.');};
const https=createHttpsServer({key,cert},(req,res)=>{
 traceAuth(req,res,'https');
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(307,{Location:origin+'/user/login'});res.end();return;}
 Promise.resolve(handler(req,res)).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end('Unable to load page');});
});
const http=createHttpServer((req,res)=>{
 traceAuth(req,res,'http');
 res.setHeader('Cache-Control','no-store');
 // Never forward passwords or callback codes from an accidental plaintext URL.
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(400);res.end('Please use HTTPS.');return;}
 let url;
 try{url=new URL(req.url||'/',origin);}catch{res.writeHead(400);res.end('Invalid URL');return;}
 const safePath=url.pathname.startsWith('/api/auth/')?'/user/login':url.pathname;
 res.writeHead(302,{Location:origin+safePath});res.end();
});
// Serve HTTPS and recover accidental HTTP links on the same local port.
const sockets=new Set();
const server=createTcpServer({pauseOnConnect:true},socket=>{
 sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
 socket.on('error',()=>{});socket.setTimeout(30000,()=>socket.destroy());
 socket.once('data',chunk=>{
  socket.pause();socket.unshift(chunk);
  (chunk[0]===22?https:http).emit('connection',socket);
  if(chunk[0]!==22)socket.resume();
 });socket.resume();
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port is already in use. Stop the development server first.':error.message);process.exit(1);});
async function stop(){server.close();for(const socket of sockets)socket.destroy();await app.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
// Reserve the port before Next touches its cache. Never silently move OAuth to another port.
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
await app.prepare();
handler=app.getRequestHandler();
https.on('upgrade',app.getUpgradeHandler());
console.log(`JUMBO GO ${dev?'development':'local presentation'} ready: ${origin}\n${dev?'HTTPS development server':'Production build'}; demo role switching disabled. Press Ctrl+C to stop.`);
