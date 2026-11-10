import { db } from './db';
import { encrypt, decrypt } from './auth-store';
import { customerDetailsSchema, type CustomerDetails } from '../auth-domain';
(await db.migrate('CREATE TABLE IF NOT EXISTS customer_details(user_id TEXT PRIMARY KEY REFERENCES users(id),encrypted BLOB NOT NULL,updated_at TEXT NOT NULL)'));
export async function saveCustomerDetails(userId: string, details: CustomerDetails) {
    const validated = customerDetailsSchema.parse(details);
    (await db.prepare('INSERT INTO customer_details VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted=excluded.encrypted,updated_at=excluded.updated_at').run(userId, encrypt(Buffer.from(JSON.stringify(validated))), new Date().toISOString()));
}
export async function getCustomerDetails(userId: string): Promise<CustomerDetails | null> {
    const row = (await db.prepare('SELECT encrypted FROM customer_details WHERE user_id=?').get(userId)) as {
        encrypted: Uint8Array;
    } | undefined;
    return row ? customerDetailsSchema.parse(JSON.parse(decrypt(row.encrypted).toString('utf8'))) : null;
}
