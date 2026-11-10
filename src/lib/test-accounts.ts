export const testAccountIds = ['qa-driver-jumbogo','qa-user-jumbogo'] as const;
export function isTestAccount(id:string){return (testAccountIds as readonly string[]).includes(id);}
export function isTestJob(id:string){return id.startsWith('qa-trip-');}
export function testJobAllowed(userId:string,jobId:string){return isTestAccount(userId)===isTestJob(jobId);}
export function testRequestAllowed(path:string,method:string){
 if(method==='GET')return /^\/api\/v1\/(session|bootstrap|jobs(?:\/[^/]+(?:\/messages)?)?|notifications)$/.test(path)||/^\/api\/maps\//.test(path)||/^\/api\/driver\/(dashboard|job\/qa-trip-[^/]+|proof\/qa-trip-[^/]+)$/.test(path)||/^\/api\/auth\/(application|customer-details)$/.test(path);
 if(method==='POST')return /^\/api\/v1\/(logout|quote|notifications\/read|jobs\/qa-trip-[^/]+\/(status|messages))$/.test(path)||/^\/api\/driver\/(work|location\/qa-trip-[^/]+|proof\/qa-trip-[^/]+)$/.test(path)||/^\/api\/maps\/(autocomplete|search)$/.test(path)||path==='/api/auth/logout';
 return false;
}
