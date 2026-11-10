import {z} from 'zod';
export const authRole=z.enum(['user','driver']);
export const documentKinds=['national_id','driving_license','vehicle_registration','insurance','vehicle_front','vehicle_rear','vehicle_left','vehicle_right'] as const;
export type DocumentKind=typeof documentKinds[number];
export const documentLabels:Record<DocumentKind,[string,string]>={national_id:['บัตรประจำตัวประชาชน','National ID card'],driving_license:['ใบอนุญาตขับรถ','Driving licence'],vehicle_registration:['สำเนาทะเบียนรถ','Vehicle registration'],insurance:['กรมธรรม์ประกันภัย','Insurance policy'],vehicle_front:['ภาพรถด้านหน้า','Vehicle front'],vehicle_rear:['ภาพรถด้านหลัง','Vehicle rear'],vehicle_left:['ภาพรถด้านซ้าย','Vehicle left'],vehicle_right:['ภาพรถด้านขวา','Vehicle right']};
export function normalizePhone(value:string){return value.replace(/[\s()-]/g,'').replace(/^\+66/,'0');}
export const accountSchema=z.object({name:z.string().trim().min(2).max(100),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),phone:z.string().transform(normalizePhone).pipe(z.string().regex(/^0[689]\d{8}$/)),role:authRole,consent:z.literal(true),contentRevision:z.number().int().nonnegative().optional()});
export const passwordSchema=z.string().min(10).max(128).regex(/[a-zA-Z]/).regex(/[0-9]/);
export const customerDetailsSchema=z.object({
 customerType:z.enum(['individual','business']),
 companyName:z.string().trim().max(150).default(''),
 address:z.string().trim().min(10).max(300),
 subdistrict:z.string().trim().min(2).max(80),
 district:z.string().trim().min(2).max(80),
 province:z.string().trim().min(2).max(80),
 postalCode:z.string().regex(/^[1-9]\d{4}$/),
}).superRefine((data,ctx)=>{if(data.customerType==='business'&&data.companyName.length<2)ctx.addIssue({code:z.ZodIssueCode.custom,path:['companyName'],message:'Company name is required'});}).transform(data=>({...data,companyName:data.customerType==='business'?data.companyName:''}));
export type CustomerDetails=z.infer<typeof customerDetailsSchema>;
export const registerSchema=accountSchema.extend({password:passwordSchema,confirmPassword:z.string().max(128).optional(),customerDetails:customerDetailsSchema.optional()}).superRefine((data,ctx)=>{
 if(data.role==='user'){
  if(!data.customerDetails)ctx.addIssue({code:z.ZodIssueCode.custom,path:['customerDetails'],message:'Contact address is required'});
  if(data.confirmPassword!==data.password)ctx.addIssue({code:z.ZodIssueCode.custom,path:['confirmPassword'],message:'Passwords must match'});
 }
});
export const loginSchema=z.object({identifier:z.string().trim().min(3).max(254),password:z.string().min(1).max(128),role:authRole});
export const personalSchema=z.object({nationalId:z.string().regex(/^\d{13}$/),birthDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&Date.parse(v)<Date.now()),address:z.string().trim().min(10).max(500),licenceNumber:z.string().trim().min(5).max(30),vehiclePlate:z.string().trim().min(3).max(30),vehicleProvince:z.string().trim().min(2).max(80),vehicleType:z.enum(['pickup','box','cage','jumbo','six'])});
export type DriverPersonal=z.infer<typeof personalSchema>;
export type DriverApplication={userId:string;status:'DRAFT'|'PENDING'|'APPROVED'|'REJECTED';personal:DriverPersonal|null;reason:string|null;submittedAt:string|null;documents:{id:string;kind:DocumentKind;uploadedAt:string}[]};
export type AuthRole=z.infer<typeof authRole>;
