import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {chromium,expect} from '@playwright/test';
const require=createRequire(import.meta.url);
const root=resolve('qa-artifacts',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(root,{recursive:true});
await writeFile(resolve(root,'test-plan.md'),'Production read-only: public pages, protected redirects/API, responsive 375/768/1280, contact links and keyboard tabs. Local: existing isolated unit/integration suite and typecheck. No payments, form submissions, real jobs, login or data mutations.');
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:String(e.message).replace(/https?:\/\/[^\s]+\?[^\s]+/g,'[URL]').slice(0,450)});}console.log(results.at(-1).status+' '+name);}
async function command(name,args){await check(name,()=>new Promise((done,reject)=>{const child=spawn(process.execPath,args,{windowsHide:true,env:{...process.env,TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:'',DATABASE_PATH:':memory:'}});let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);child.on('error',reject);child.on('close',async code=>{await writeFile(resolve(root,name+'.log'),log);code===0?done():reject(Error('exit '+code+'; see '+name+'.log'));});}));}
if(!process.argv.includes('--production-only')){
 await command('unit-integration',['--import','tsx','--test','tests/*.test.ts']);
 await command('typecheck',[require.resolve('typescript/bin/tsc'),'--noEmit']);
}
let browser;
await check('browser-run',async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true,timeout:20000});
 const context=await browser.newContext({serviceWorkers:'block'});
 // Block mutations even if a future page unexpectedly attempts one.
 await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(12000);
 for(const width of [375,768,1280]){
  await page.setViewportSize({width,height:900});
  for(const path of ['/','/jobs','/user/login','/driver/login','/user/register','/driver/register','/privacy','/terms/user','/terms/driver']){
   await check(`${width} ${path}`,async()=>{
    const errors=[];const onError=()=>errors.push('pageerror');page.on('pageerror',onError);
    try{
     const response=await page.goto('https://jumbogo.app'+path,{waitUntil:'load',timeout:30000});
     expect(response.status()).toBe(200);await expect(page.locator('body')).not.toBeEmpty();
     expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
     expect(await page.locator('img').evaluateAll(els=>els.filter(e=>e.complete&&!e.naturalWidth).length)).toBe(0);
     expect(errors).toEqual([]);
     await page.screenshot({path:resolve(root,`${width}-${path.replaceAll('/','-')||'home'}.png`)});
    }finally{page.off('pageerror',onError);}
   });
  }
 }
 await check('contact-and-keyboard',async()=>{
  await page.setViewportSize({width:375,height:812});await page.goto('https://jumbogo.app/');
  await page.getByRole('button',{name:'เปิดเมนู',exact:true}).click();
  await page.getByRole('navigation').getByRole('link',{name:'ติดต่อเรา'}).click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.locator('#contact a').nth(0)).toHaveAttribute('href','https://lin.ee/vgTxjKj');
  await expect(page.locator('#contact a').nth(1)).toHaveAttribute('href','https://www.facebook.com/profile.php?id=61594781590357');
  await expect(page.locator('#contact a').nth(2)).toHaveAttribute('href','tel:0832452000');
  await page.getByRole('tab').nth(0).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected','true');
 });
 for(const [path,login] of [['/user/home','/user/login'],['/driver/home','/driver/login'],['/admin/content','/admin/login']])await check('protected '+path,async()=>{await page.goto('https://jumbogo.app'+path);await expect(page).toHaveURL('https://jumbogo.app'+login);});
 for(const path of ['/api/wallet-payments/beam/list','/api/wallet-payments/beam/finance'])await check('unauthenticated '+path,async()=>{const r=await context.request.get('https://jumbogo.app'+path);expect(r.status()).toBe(401);});
 await context.close();
});
await browser?.close();
await writeFile(resolve(root,'results.json'),JSON.stringify(results,null,2));
const failed=results.filter(r=>r.status==='FAIL');
await writeFile(resolve(root,'report.md'),`# Automated QA\n\nTarget: https://jumbogo.app (read-only)\n\nPASS: ${results.length-failed.length}; FAIL/BLOCKED: ${failed.length}\n\n${results.map(r=>`- ${r.status}: ${r.name}${r.error?' — '+r.error:''}`).join('\n')}\n\nNot tested on Production: authenticated booking/acceptance lifecycle, GPS on real devices, admin changes, wallet mutations and banking. Existing isolated tests cover business rules but do not prove live integrations.\n`);
console.log('Report: '+resolve(root,'report.md'));
process.exitCode=failed.length?1:0;
