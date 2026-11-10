import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createClient,type InValue,type Transaction} from '@libsql/client';

const remote=process.env.TURSO_DATABASE_URL;
if(process.env.VERCEL==='1'&&!remote&&process.env.JUMBO_BUILD!=='1')throw new Error('TURSO_DATABASE_URL is required on Vercel; local database fallback is disabled.');
export const migrateSchema=!remote||process.env.DATABASE_MIGRATE==='true';
const local=process.env.DATABASE_PATH||'./data/jumbogo.db';
if(!remote&&local!==':memory:')mkdirSync(dirname(resolve(local)),{recursive:true});
const client=createClient({url:remote||(local===':memory:'?':memory:':pathToFileURL(resolve(local)).href),authToken:remote?process.env.TURSO_AUTH_TOKEN:undefined});
const scope=new AsyncLocalStorage<Transaction>();
// Keep a local client's operations out of another request's transaction. The
// remote database additionally serializes write transactions across instances.
let queue:Promise<void>=Promise.resolve();
async function exclusive<T>(fn:()=>Promise<T>):Promise<T>{
  const before=queue;let release!:()=>void;
  queue=new Promise<void>(done=>{release=done;});
  await before;
  try{return await fn();}finally{release();}
}
async function operation<T>(fn:(connection:typeof client|Transaction)=>Promise<T>):Promise<T>{
  const current=scope.getStore();
  return current?fn(current):exclusive(()=>fn(client));
}
type Value=string|number|bigint|Uint8Array|null;
type Row=Record<string,Value>;
function rows(input:Iterable<Record<string,unknown>>):Row[]{
  return Array.from(input,row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof ArrayBuffer?new Uint8Array(value):value])) as Row);
}
export const db={
  async migrate(sql:string){if(migrateSchema)await db.exec(sql);},
  async exec(sql:string){
    const statements=remote?sql.replace(/PRAGMA journal_mode=WAL;?/gi,''):sql;
    await operation(connection=>connection.executeMultiple(statements));
  },
  prepare(sql:string){
    const execute=(args:InValue[])=>operation(connection=>connection.execute({sql,args}));
    return {
      async get(...args:InValue[]):Promise<Row|undefined>{return rows((await execute(args)).rows)[0];},
      async all(...args:InValue[]):Promise<Row[]>{return rows((await execute(args)).rows);},
      async run(...args:InValue[]){const result=await execute(args);return {changes:result.rowsAffected,lastInsertRowid:result.lastInsertRowid};}
    };
  }
};
export async function transaction<T>(fn:()=>T|Promise<T>):Promise<T>{
  if(scope.getStore())return await fn();
  return exclusive(async()=>{
    const tx=await client.transaction('write');
    try{
      const result=await scope.run(tx,fn);
      await tx.commit();
      return result;
    }catch(error){await tx.rollback();throw error;}
    finally{tx.close();}
  });
}
