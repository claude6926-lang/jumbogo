import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_PATH=':memory:';
test('async transactions wait for callbacks, roll back errors and isolate concurrent writers',async()=>{
 const {db,transaction}=await import('../src/lib/server/database-client');
 await db.exec('CREATE TABLE transaction_check(id INTEGER PRIMARY KEY,value INTEGER NOT NULL)');
 await assert.rejects(transaction(async()=>{await db.prepare('INSERT INTO transaction_check VALUES(1,10)').run();await Promise.resolve();throw new Error('rollback');}),/rollback/);
 assert.equal((await db.prepare('SELECT count(*) n FROM transaction_check').get())?.n,0);
 await db.prepare('INSERT INTO transaction_check VALUES(1,0)').run();
 await Promise.all(Array.from({length:8},()=>transaction(async()=>{const row=await db.prepare('SELECT value FROM transaction_check WHERE id=1').get();await Promise.resolve();await db.prepare('UPDATE transaction_check SET value=? WHERE id=1').run(Number(row!.value)+1);})));
 assert.equal((await db.prepare('SELECT value FROM transaction_check WHERE id=1').get())?.value,8);
});
