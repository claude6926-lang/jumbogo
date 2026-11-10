import type {Job,Role} from './domain';

export type AdminUser={id:string;name:string;role:Role;phone:string;email:string|null;createdAt:string|null;applicationStatus:string|null;providers:string[]};
export type AdminTicket={id:string;userId:string;name:string;subject:string;status:'OPEN'|'IN_PROGRESS'|'RESOLVED';at:string;note:string;updatedAt:string|null};
export type AdminAudit={id:string;actor:string;actorName:string|null;action:string;at:string;detail:string};
export type AdminOverview={jobs:Job[];users:AdminUser[];audit:AdminAudit[];tickets:AdminTicket[];pendingDrivers:number};

// Quote every cell and neutralize spreadsheet formulas, including leading whitespace.
export function csvCell(value:string){return '"'+(/^[\s]*[=+@-]/.test(value)?"'"+value:value).replace(/"/g,'""')+'"';}
