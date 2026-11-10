import { z } from 'zod';
import {coordinateSchema,type Coordinate} from './maps';
export const statuses = ['CREATED','SEARCHING','ACCEPTED','ARRIVING','ARRIVED_PICKUP','PICKED_UP','IN_TRANSIT','ARRIVED_DROPOFF','COMPLETED','CANCELLED','FAILED'] as const;
export type Status = typeof statuses[number];
export type Role = 'user'|'driver'|'admin';
export type Vehicle = {id:string; th:string; en:string; capacity:string; dimensions:string; base:number; rate:number; kind:string};
export const initialVehicles: Vehicle[] = [
 {id:'pickup',th:'กระบะ',en:'Pickup',capacity:'1',dimensions:'1.5 × 2.1 × 1.5',base:250,rate:12,kind:'pickup'},
 {id:'box',th:'กระบะตู้ทึบ',en:'Box pickup',capacity:'1.5',dimensions:'1.5 × 2.1 × 2.1',base:350,rate:14,kind:'box'},
 {id:'cage',th:'กระบะคอก',en:'Cage pickup',capacity:'1.5',dimensions:'1.5 × 2.1 × 2.0',base:350,rate:14,kind:'cage'},
 {id:'jumbo',th:'จัมโบ้',en:'Jumbo',capacity:'3–5',dimensions:'2.0 × 4.0 × 2.1',base:650,rate:20,kind:'jumbo'},
 {id:'six',th:'6 ล้อ',en:'6-wheel',capacity:'5–10',dimensions:'2.3 × 6.0 × 2.3',base:1200,rate:28,kind:'six'},
];
export const stopContactSchema=z.object({name:z.string().trim().min(2).max(100),phone:z.string().trim().regex(/^\+?[0-9]{8,15}$/)});
export type StopContact=z.infer<typeof stopContactSchema>;
export const bookingSchema = z.object({locations:z.array(coordinateSchema).min(2).max(4).optional(),quoteId:z.string().uuid().optional(),pickup:z.string().trim().min(3).max(300),drops:z.array(z.string().trim().min(3).max(300)).min(1).max(3),contacts:z.object({pickup:stopContactSchema,drops:z.array(stopContactSchema).min(1).max(3)}).optional(),vehicle:z.string(),helper:z.boolean(),extraHelpers:z.number().int().min(0).max(4).optional(),pickupStairs:z.number().int().min(0).max(20).optional(),dropStairs:z.number().int().min(0).max(20).optional(),scheduledAt:z.string().nullable(),note:z.string().max(500),payment:z.enum(['cash','wallet']),useCredit:z.boolean()}).superRefine((value,ctx)=>{if(!value.helper&&(value.extraHelpers||0)>0)ctx.addIssue({code:z.ZodIssueCode.custom,path:['extraHelpers'],message:'Select the first helper before adding more'});if(value.contacts&&value.contacts.drops.length!==value.drops.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:['contacts','drops'],message:'One contact is required per stop'});});
export type BookingInput = z.infer<typeof bookingSchema>;
export type Fare = {base:number;distance:number;distanceFee:number;helper:number;stops:number;stairs?:number;total:number};
export function calculateFare(vehicle:Vehicle,distance:number,helper:boolean,stops:number):Fare {
 if (!Number.isFinite(distance)||distance<0||stops<1||stops>3) throw new Error('INVALID_FARE');
 const fare={base:vehicle.base,distance,distanceFee:Math.round(distance*vehicle.rate),helper:helper?150:0,stops:(stops-1)*100,total:0};
 fare.total=fare.base+fare.distanceFee+fare.helper+fare.stops; return fare;
}
export function validateSchedule(value:string|null,now=Date.now()) { if(value){const delta=Date.parse(value)-now;if(!Number.isFinite(delta)||delta<2*3600000||delta>30*86400000)throw new Error('SCHEDULE_RANGE');} }
export function addBookingExtras(fare:Fare,input:Pick<BookingInput,'helper'|'extraHelpers'|'pickupStairs'|'dropStairs'>,stairsRate:number|null):Fare{const extra=input.extraHelpers||0,floors=(input.pickupStairs||0)+(input.dropStairs||0);if(!Number.isInteger(extra)||extra<0||extra>4||(!input.helper&&extra>0))throw Error('INVALID_HELPERS');for(const n of [input.pickupStairs||0,input.dropStairs||0])if(!Number.isInteger(n)||n<0||n>20)throw Error('INVALID_STAIRS');if(floors&&(stairsRate===null||!Number.isInteger(stairsRate)||stairsRate<0))throw Error('STAIRS_NOT_AVAILABLE');const stairs=floors*(stairsRate??0);return {...fare,helper:fare.helper+extra*150,...(floors?{stairs}:{}),total:fare.total+extra*150+stairs};}
const transitions:Record<Status,Status[]>={CREATED:['SEARCHING','CANCELLED'],SEARCHING:['ACCEPTED','CANCELLED','FAILED'],ACCEPTED:['ARRIVING','CANCELLED'],ARRIVING:['ARRIVED_PICKUP','CANCELLED'],ARRIVED_PICKUP:['PICKED_UP','CANCELLED'],PICKED_UP:['IN_TRANSIT'],IN_TRANSIT:['ARRIVED_DROPOFF'],ARRIVED_DROPOFF:['COMPLETED'],COMPLETED:[],CANCELLED:[],FAILED:[]};
export function canTransition(from:Status,to:Status){return transitions[from].includes(to);}
export function phoneUri(phone:string){const normalized=phone.replace(/[\s()-]/g,'');if(!/^\+?[0-9]{8,15}$/.test(normalized))return null;return `tel:${normalized}`;}
export type Job = {services?:{helperCount:number;pickupStairs:number;dropStairs:number};locations?:Coordinate[];contacts?:{pickup:StopContact;drops:StopContact[]};id:string;userId:string;driverId:string|null;pickup:string;drops:string[];vehicle:string;status:Status;fare:Fare;credit:number;total:number;note:string;scheduledAt:string|null;createdAt:string;driverName?:string;driverPhone?:string;history:{from:Status|null;to:Status;at:string;actor:string;reason?:string}[]};
export type Message = {id:string;jobId:string;sender:string;role:Role;text:string;at:string};
export type LedgerEntry = {id:string;amount:number;kind:string;at:string;jobId?:string};
export type Session = {id:string;name:string;role:Role;phone:string;adminAccount?:boolean;businessAccount?:boolean};
