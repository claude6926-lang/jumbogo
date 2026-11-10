import type {Job} from './domain';
type Assignment=Pick<Job,'id'|'driverId'|'status'|'scheduledAt'>;
const terminal=new Set(['COMPLETED','CANCELLED','FAILED']);
export function acceptanceError(job:Assignment,jobs:Assignment[],driverId:string,now=Date.now()):string|null{
 if(job.driverId)return 'ALREADY_ASSIGNED';
 if(job.status!=='SEARCHING')return 'INVALID_TRANSITION';
 const open=jobs.filter(j=>j.driverId===driverId&&j.id!==job.id&&!terminal.has(j.status));
 if(job.scheduledAt){
  const when=Date.parse(job.scheduledAt);
  if(!Number.isFinite(when)||when<=now)return 'SCHEDULE_EXPIRED';
  if(open.some(j=>j.scheduledAt&&Date.parse(j.scheduledAt)===when))return 'SCHEDULE_CONFLICT';
  return null;
 }
 // Future reservations do not occupy the current delivery slot.
 return open.some(j=>j.status!=='ACCEPTED'||!j.scheduledAt||Date.parse(j.scheduledAt)<=now)?'DRIVER_BUSY':null;
}
export function startError(job:Assignment,jobs:Assignment[]):string|null{
 return jobs.some(j=>j.id!==job.id&&j.driverId===job.driverId&&!terminal.has(j.status)&&(j.status!=='ACCEPTED'||!j.scheduledAt))?'DRIVER_BUSY':null;
}
