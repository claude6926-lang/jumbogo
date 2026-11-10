import {z} from 'zod';
import {db,audit,transaction} from './db';
import {AuthError} from './auth-store';
import type {Session} from '../domain';
await db.migrate('CREATE TABLE IF NOT EXISTS booking_extra_rates(id INTEGER PRIMARY KEY CHECK(id=1),stairs_per_floor INTEGER); INSERT OR IGNORE INTO booking_extra_rates VALUES(1,NULL);');
export async function bookingExtraRates(){const row=await db.prepare('SELECT stairs_per_floor FROM booking_extra_rates WHERE id=1').get();return {helper_per_person:150,stairs_per_floor:row?.stairs_per_floor==null?null:Number(row.stairs_per_floor)};}
export async function saveBookingExtraRates(user:Session,input:unknown){if(user.role!=='admin')throw new AuthError(403,'FORBIDDEN');const data=z.object({stairs_per_floor:z.number().int().min(0).max(100000).nullable()}).strict().parse(input);return transaction(async()=>{await db.prepare('UPDATE booking_extra_rates SET stairs_per_floor=? WHERE id=1').run(data.stairs_per_floor);await audit(user.id,'BOOKING_EXTRA_RATES',data);return bookingExtraRates();});}
