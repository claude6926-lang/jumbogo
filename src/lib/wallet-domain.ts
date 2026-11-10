export type Bank = {id:string;name:string;accountName:string;accountNumber:string;active:boolean;revision?:string};
export type Topup = {id:string;userId:string;name:string;role:string;amount:number;bank:Bank;status:string;reason:string;reference:string;at:string};
export type WalletPolicy = {enabled:boolean;allowNegative:boolean;cancellationFee:number;noShowFee:number};
export type WalletRecord = {id:string;amount:number;kind:string;at:string;reason:string;jobId:string|null};
export type WalletData = {paymentMode:string;banks:Bank[];topups:Topup[];policy:WalletPolicy;entries:WalletRecord[];users?:{id:string;name:string;role:string;balance:number}[]};
