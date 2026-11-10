// Run daily with the existing database environment injected. Does not load .env files.
export {};
const {db}=await import('../src/lib/server/db');
const cutoff=new Date(Date.now()-30*86400000).toISOString();
await db.prepare('DELETE FROM delivery_locations WHERE at<?').run(cutoff);
console.log('Removed tracking coordinates older than 30 days. No location history is retained.');
