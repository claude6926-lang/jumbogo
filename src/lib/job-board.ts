export const boardVehicles = { pickup: 'กระบะ', box: 'ตู้ทึบ', cage: 'คอก', jumbo: 'จัมโบ้', six: '6 ล้อ' };
export type BoardJob = {
 id:string; poster_id:string; vehicle_type:keyof typeof boardVehicles; job_type:string; pickup:string; dropoff:string;
 scheduled_at:string; helpers_count:number; price_thb:number; price_note:string; allow_offers:number;
 body_public:string; contact_phone_private?:string; status:string; accepted_by:string|null; accepted_at:string|null; created_at:string;
 assignment?:{driver_id:string;state:string}|null;fee_discount_pct?:number;
};
export const boardStatuses:Record<string,string> = {open:'เปิดรับคนขับ',accepted:'มีคนรับแล้ว',in_progress:'กำลังดำเนินงาน',done:'เสร็จงาน',cancelled:'ยกเลิก',expired:'หมดอายุ'};
// Thai landline (9 digits) and mobile (10 digits), including Thai numerals and +66/(0).
export function maskPhones(text:string) {
 const digits = text.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0E50));
 const re = /(?<!\d)(?:\+?66[\s.()\-]*(?:0[\s.()\-]*)?|0)(?:[\s.()\-]*\d){8,9}(?!\d)/g;
 const spans = [...digits.matchAll(re)];
 let out=text;
 for (const m of spans.reverse()) out=out.slice(0,m.index)+'[ติดต่อผ่านระบบ]'+out.slice(m.index!+m[0].length);
 return out;
}
export function boardShare(job:BoardJob,origin:string) {
 const text=maskPhones(`${job.body_public}\nรถ: ${boardVehicles[job.vehicle_type]} · ${job.job_type}\nต้นทาง: ${job.pickup}\nปลายทาง: ${job.dropoff}\nนัด: ${new Date(job.scheduled_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}\nราคา: ${job.price_thb.toLocaleString('th-TH')} บาท ${job.price_note}\nคนยก: ${job.helpers_count} คน${job.allow_offers?' · เสนอราคาได้':''}`);
 // Keep the canonical UUID link intact; it never contains contact data.
 return `${text}\n${origin}/jobs/${encodeURIComponent(job.id)}`;
}
export function parseBoardChat(text:string) {
 const field=(label:string)=>text.match(new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:：]\\s*([^\\n]+)`))?.[1]?.trim();
 const phone=text.match(/(?:\+66|0)(?:[ .()-]*\d){8,9}/)?.[0]||'';
 const price=(field('ราคา|ค่ารถ')||text.match(/([\d,]+)\s*บาท/)?.[1]||'').replace(/[^\d.]/g,'');
 const vehicle=(Object.entries(boardVehicles).find(([,label])=>text.includes(label))?.[0]||'pickup') as keyof typeof boardVehicles;
 const date=field('วันเวลา|นัด|วันที่');
 const scheduled=date?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
 const helpers=(field('คนยก|คนช่วย')||'').match(/\d+/)?.[0];
 return {body_public:maskPhones(text),pickup:maskPhones(field('ต้นทาง|รับ|จุดรับ')||''),dropoff:maskPhones(field('ปลายทาง|ส่ง|จุดส่ง')||''),price_thb:price,contact_phone_private:phone,vehicle_type:vehicle,price_note:maskPhones(field('เงื่อนไข|หมายเหตุ')||''),...(scheduled?{scheduled_at:scheduled[1]+'T'+scheduled[2]}:{}),...(helpers?{helpers_count:helpers}:{}),...(field('ประเภทงาน')?{job_type:maskPhones(field('ประเภทงาน')!)}:{})};
}
