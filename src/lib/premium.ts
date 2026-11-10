export const premiumRights={direct_dispatch:'ส่งงานให้คนขับประจำ',repeat_post:'สร้างโพสต์ซ้ำ',manage_drivers:'จัดการรายชื่อคนขับประจำ'} as const;
export type PremiumRights=Record<keyof typeof premiumRights,boolean>;
export const defaultRights:PremiumRights={direct_dispatch:true,repeat_post:true,manage_drivers:true};
