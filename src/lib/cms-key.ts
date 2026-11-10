export function textKey(th:string,en:string){
 let hash=2166136261;for(const char of th+'\u0000'+en){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
 return 'text.'+(hash>>>0).toString(16);
}
export type CmsValues=Record<string,string>;
export type CmsSnapshot={revision:number;values:CmsValues};
export const cmsSections=['หน้าแรก (hero)','บริการ','เลือกรถ','ขั้นตอน','เริ่มใช้งาน/CTA','ส่วนท้าย','SEO','ติดต่อ'] as const;
export type CmsSection=typeof cmsSections[number];
export type CmsField={id:string;group:string;label:string;type:string;default?:string;th?:string;en?:string;sources?:string[]};
export function cmsSection(field:CmsField):CmsSection{
 const home=/^home\.(\d+)$/.exec(field.id);
 if(home){const n=Number(home[1]);return n<=28?cmsSections[0]:n<=37?cmsSections[1]:n<=45?cmsSections[2]:n<=56?cmsSections[3]:n<=74?cmsSections[4]:cmsSections[5];}
 if(field.id.startsWith('vehicle.')||field.id.startsWith('fleet.image.'))return cmsSections[2];
 if(field.id.startsWith('seo.'))return cmsSections[6];
 if(field.id.startsWith('contact.'))return cmsSections[7];
 if(field.id.startsWith('brand.'))return cmsSections[0];
 return (field.sources||[field.group]).some(source=>/ข้อตกลง|ความเป็นส่วนตัว/.test(source))?cmsSections[5]:cmsSections[4];
}
export function cmsAdvancedCategory(field:CmsField){if(field.type==='translation')return 'ข้อความระบบ / '+field.group;if(field.type==='link'||field.type==='image'||field.id==='home.27')return 'ลิงก์และพาธรูป';return 'เมนูและแบรนด์';}
export function cmsIsAdvanced(field:CmsField){const home=/^home\.(\d+)$/.exec(field.id);return field.type==='link'||field.type==='translation'||!!home&&(Number(home[1])<=16||Number(home[1])===27)||['brand.primary','brand.secondary','brand.authImage'].includes(field.id);}
export function cmsFieldDefault(field:CmsField,language:'th'|'en'){return field.type==='translation'?(language==='th'?field.th:field.en)||'':field.default||'';}
