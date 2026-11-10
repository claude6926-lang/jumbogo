import { z } from 'zod';
import { db, audit, transaction, getJobs } from './db';
import { AuthError,checkPassword,hashPassword,rateLimit } from './auth-store';
import {passwordSchema} from '../auth-domain';
import './password-reset';
import './wallet-store';
import './driver-store';
import type { Session } from '../domain';
import type { AdminOverview, AdminUser, AdminTicket, AdminAudit } from '../admin-domain';
(await db.migrate(`CREATE TABLE IF NOT EXISTS ticket_updates(ticket_id TEXT PRIMARY KEY REFERENCES tickets(id),note TEXT NOT NULL,actor TEXT NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL)`));
function requireAdmin(user: Session) { if (user.role !== 'admin')
    throw new AuthError(403, 'FORBIDDEN'); }
export async function manageUser(actor:Session,id:string,body:unknown){
 requireAdmin(actor);
 const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('edit'),name:z.string().trim().min(2).max(80),phone:z.string().regex(/^\+?[0-9]{8,15}$/)}),
  z.object({action:z.literal('password'),password:passwordSchema,adminPassword:z.string().max(128)}),
  z.object({action:z.literal('delete'),confirmation:z.literal('DELETE'),adminPassword:z.string().max(128)})
 ]).parse(body);
 await rateLimit(`admin-users:${actor.id}`,30,60000);
 if(input.action!=='edit'){
  const admin=await db.prepare('SELECT password_hash FROM accounts WHERE user_id=?').get(actor.id);
  if(!await checkPassword(input.adminPassword,admin?.password_hash as string|null))throw new AuthError(403,'ADMIN_PASSWORD_INVALID');
 }
 const hash=input.action==='password'?await hashPassword(input.password):null;
 return transaction(async()=>{
  const target=await db.prepare('SELECT u.role,a.password_hash FROM users u JOIN accounts a ON a.user_id=u.id WHERE u.id=?').get(id);
  if(!target)throw new AuthError(404,'NOT_FOUND');
  if(target.role==='admin')throw new AuthError(403,'ADMIN_ACCOUNT_PROTECTED');
  if(input.action==='edit'){
   if(await db.prepare('SELECT user_id FROM accounts WHERE phone=? AND user_id!=? AND (role=? OR role=?)').get(input.phone,id,target.role,'admin'))throw new AuthError(409,'PHONE_IN_USE');
   await db.prepare('UPDATE users SET name=?,phone=? WHERE id=?').run(input.name,input.phone,id);
   await db.prepare('UPDATE accounts SET phone=? WHERE user_id=?').run(input.phone,id);
  }else if(input.action==='password'){
   if(!target.password_hash)throw new AuthError(409,'SOCIAL_PASSWORD_UNSUPPORTED');
   await db.prepare('UPDATE accounts SET password_hash=? WHERE user_id=?').run(hash,id);
   await db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
   await db.prepare('DELETE FROM password_resets WHERE user_id=?').run(id);
  }else{
   const active=await db.prepare("SELECT id FROM jobs WHERE (user_id=? OR driver_id=?) AND status NOT IN ('COMPLETED','CANCELLED','FAILED') LIMIT 1").get(id,id);
   const money=await db.prepare('SELECT COALESCE(SUM(amount),0) AS amount FROM ledger WHERE user_id=?').get(id);
   const pending=await db.prepare("SELECT id FROM wallet_topups WHERE user_id=? AND status='PENDING' LIMIT 1").get(id);
   const withdrawals=await db.prepare("SELECT id FROM driver_withdrawals WHERE driver_id=? AND status='PENDING' LIMIT 1").get(id);
   const earnings=await db.prepare("SELECT COALESCE((SELECT SUM(net) FROM driver_settlements WHERE driver_id=?),0)-COALESCE((SELECT SUM(amount) FROM driver_withdrawals WHERE driver_id=? AND status='PAID'),0) AS amount").get(id,id);
   const unsettled=await db.prepare("SELECT j.id FROM jobs j LEFT JOIN driver_settlements s ON s.job_id=j.id WHERE j.driver_id=? AND j.status='COMPLETED' AND s.job_id IS NULL LIMIT 1").get(id);
   if(active||Number(money?.amount)!==0||pending||withdrawals||Number(earnings?.amount)!==0||unsettled)throw new AuthError(409,'ACCOUNT_HAS_OBLIGATIONS');
   await db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
   await db.prepare('DELETE FROM password_resets WHERE user_id=?').run(id);
   await db.prepare('DELETE FROM identities WHERE user_id=?').run(id);
   await db.prepare('DELETE FROM accounts WHERE user_id=?').run(id);
   await db.prepare('UPDATE driver_work SET online=0 WHERE user_id=?').run(id);
   await db.prepare("UPDATE driver_applications SET status='REJECTED' WHERE user_id=?").run(id);
   await db.prepare('UPDATE users SET name=?,phone=? WHERE id=?').run('บัญชีที่ลบแล้ว','',id);
  }
  await audit(actor.id,`ADMIN_USER_${input.action.toUpperCase()}`,{userId:id});
  return {ok:true};
 });
}
export async function adminOverview(user: Session): Promise<AdminOverview> {
    requireAdmin(user);
    const users = (await db.prepare(`SELECT u.id,u.name,u.role,u.phone,a.email,a.created_at AS createdAt,d.status AS applicationStatus FROM users u JOIN accounts a ON a.user_id=u.id LEFT JOIN driver_applications d ON d.user_id=u.id WHERE u.id NOT LIKE 'demo-%' ORDER BY a.created_at DESC,u.name`).all()) as Omit<AdminUser, 'providers'>[];
    const identities = (await db.prepare('SELECT user_id,provider FROM identities').all()) as {
        user_id: string;
        provider: string;
    }[];
    const providers = new Map<string, string[]>();
    for (const identity of identities)
        providers.set(identity.user_id, [...(providers.get(identity.user_id) || []), identity.provider]);
    return {
        jobs: (await getJobs(user.id, 'admin')),
        users: users.map(u => ({ ...u, providers: providers.get(u.id) || [] })),
        pendingDrivers: Number((await db.prepare("SELECT COUNT(*) AS n FROM driver_applications WHERE status='PENDING'").get())?.n || 0),
        audit: (await db.prepare('SELECT a.*,u.name AS actorName FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.at DESC,a.rowid DESC LIMIT 100').all()) as AdminAudit[],
        tickets: (await db.prepare(`SELECT t.id,t.user_id AS userId,u.name,t.subject,t.status,t.at,COALESCE(tu.note,'') AS note,tu.updated_at AS updatedAt FROM tickets t JOIN users u ON u.id=t.user_id LEFT JOIN ticket_updates tu ON tu.ticket_id=t.id ORDER BY t.at DESC,t.rowid DESC`).all()) as AdminTicket[]
    };
}
const updateSchema = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']), expectedStatus: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']), note: z.string().trim().min(3).max(1000) });
export async function updateTicket(user: Session, id: string, body: unknown) {
    requireAdmin(user);
    const input = updateSchema.parse(body);
    (await transaction(async () => {
        const ticket = (await db.prepare('SELECT status FROM tickets WHERE id=?').get(id)) as {
            status: string;
        } | undefined;
        if (!ticket)
            throw new AuthError(404, 'NOT_FOUND');
        if (ticket.status !== input.expectedStatus)
            throw new AuthError(409, 'TICKET_CHANGED');
        const at = new Date().toISOString();
        (await db.prepare('UPDATE tickets SET status=? WHERE id=?').run(input.status, id));
        (await db.prepare('INSERT INTO ticket_updates VALUES(?,?,?,?) ON CONFLICT(ticket_id) DO UPDATE SET note=excluded.note,actor=excluded.actor,updated_at=excluded.updated_at').run(id, input.note, user.id, at));
        (await audit(user.id, 'SUPPORT_UPDATED', { ticket: id, from: ticket.status, to: input.status, note: input.note }));
    }));
    return { ok: true };
}
