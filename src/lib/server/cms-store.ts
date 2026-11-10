import {db,transaction,audit} from './db';
import catalog from '../cms/catalog.json';
import type {CmsSnapshot,CmsValues} from '../cms-key';

await db.migrate(`CREATE TABLE IF NOT EXISTS cms_state(id INTEGER PRIMARY KEY CHECK(id=1), draft TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, published TEXT NOT NULL, published_revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cms_releases(id INTEGER PRIMARY KEY AUTOINCREMENT,revision INTEGER NOT NULL,content TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cms_media(id TEXT PRIMARY KEY,bytes BLOB NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
INSERT OR IGNORE INTO cms_state VALUES(1,'{}',0,'{}',0,'');`);
export class CmsError extends Error{constructor(public status:number,message:string){super(message);}}
const allowed=new Map<string,{type:string;max:number}>();
const defaults:CmsValues={};
for(const field of catalog){if(field.type==='translation'){defaults[field.id+'.th']=field.th!;defaults[field.id+'.en']=field.en!;}else defaults[field.id]=field.default!;}
for(const field of catalog){if(field.type==='translation'){allowed.set(field.id+'.th',{type:'text',max:12000});allowed.set(field.id+'.en',{type:'text',max:12000});}else allowed.set(field.id,{type:field.type,max:field.type==='text'?12000:2048});}
export function validateContent(input:unknown):CmsValues{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new CmsError(400,'INVALID_CONTENT');
 const values:CmsValues={};
 for(const [key,value] of Object.entries(input)){const field=allowed.get(key);if(!field||typeof value!=='string'||!value.trim()||value.length>field.max)throw new CmsError(400,'INVALID_CONTENT');
  if(field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new CmsError(400,'INVALID_CONTENT');
  if(field.type==='image'||field.type==='link'){
   // No protocol-relative URLs, encoded control characters, script schemes or credentials.
   if(/[\s\\\u0000-\u001f]/.test(value)||/%(?:0[0-9a-f]|1[0-9a-f]|5c)/i.test(value))throw new CmsError(400,'INVALID_URL');
   const local=/^\/(?!\/)/.test(value)||field.type==='link'&&/^#[\w-]+$/.test(value);
   if(!local){let url:URL;try{url=new URL(value);}catch{throw new CmsError(400,'INVALID_URL');}if(url.protocol!=='https:'||url.username||url.password)throw new CmsError(400,'INVALID_URL');}
  }values[key]=value;
 }if(JSON.stringify(values).length>1000000)throw new CmsError(413,'CONTENT_TOO_LARGE');return values;
}
async function state(){const row=await db.prepare('SELECT * FROM cms_state WHERE id=1').get();if(!row)throw new CmsError(503,'CMS_MIGRATION_REQUIRED');return row;}
export async function publishedContent():Promise<CmsSnapshot>{const row=await state();return {revision:Number(row.published_revision),values:JSON.parse(String(row.published))};}
export async function contentEditor(){const row=await state();return {revision:Number(row.revision),publishedRevision:Number(row.published_revision),values:JSON.parse(String(row.draft)) as CmsValues,published:JSON.parse(String(row.published)) as CmsValues,updatedAt:String(row.updated_at),history:await db.prepare('SELECT id,revision,actor,at FROM cms_releases ORDER BY id DESC LIMIT 30').all()};}
export async function mutateContent(actor:string,action:'save'|'publish'|'restore',expected:number,values?:unknown,releaseId?:number){return transaction(async()=>{
 const row=await state();if(Number(row.revision)!==expected)throw new CmsError(409,'CONTENT_CHANGED');
 let draft=JSON.parse(String(row.draft)) as CmsValues;
 if(action==='save')draft=validateContent(values);
 if(action==='restore'){const old=await db.prepare('SELECT content FROM cms_releases WHERE id=?').get(releaseId??-1);if(!old)throw new CmsError(404,'RELEASE_NOT_FOUND');draft=validateContent(JSON.parse(String(old.content)));}
 const revision=expected+1,at=new Date().toISOString();
 await db.prepare('UPDATE cms_state SET draft=?,revision=?,updated_at=? WHERE id=1').run(JSON.stringify(draft),revision,at);
 if(action==='publish'){
  validateContent(draft);
  // Snapshot every release: later edits never rewrite an accepted document.
  if(Number(row.published_revision)===0&&!(await db.prepare('SELECT id FROM cms_releases WHERE revision=0').get()))await db.prepare('INSERT INTO cms_releases(revision,content,actor,at) VALUES(0,?,?,?)').run(JSON.stringify({...defaults,...JSON.parse(String(row.published))}),actor,at);
  await db.prepare('INSERT INTO cms_releases(revision,content,actor,at) VALUES(?,?,?,?)').run(revision,JSON.stringify({...defaults,...draft}),actor,at);
  await db.prepare('UPDATE cms_state SET published=?,published_revision=? WHERE id=1').run(JSON.stringify(draft),revision);
 }
 await audit(actor,'CMS_'+action.toUpperCase(),{revision,releaseId,fields:Object.keys(draft).length});return contentEditor();
});}
