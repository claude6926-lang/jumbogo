// Run with production variables injected by Vercel CLI; never print credentials.
process.env.DATABASE_MIGRATE='false';
process.env.DEMO_MODE='false';
if(!process.env.TURSO_DATABASE_URL)throw new Error('Remote database environment required');
const {db,transaction}=await import('../src/lib/server/database-client');
// Read only this feature schema, without importing auth or other migrations.
const {readFile}=await import('node:fs/promises');
const source=await readFile(new URL('../src/lib/server/board-commission.ts',import.meta.url),'utf8');
const sql=source.match(/export const commissionSchema=`([\s\S]*?)`;/)?.[1];
if(!sql)throw new Error('Commission schema missing');
await transaction(async()=>{for(const statement of sql.split(';').filter(s=>s.trim()))await db.prepare(statement).run();});
const row=await db.prepare('SELECT rate FROM board_commission_settings WHERE id=1').get();
console.log('Commission schema ready; current rate:',row?.rate);
