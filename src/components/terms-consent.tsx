'use client';
import Link from 'next/link';
import {CmsContext,useCms} from '@/lib/cms-context';
import {useContext,useEffect,useId,useRef,useState} from 'react';
import {X,Check} from 'lucide-react';
import {useText} from '@/lib/i18n';
import {TERMS_VERSION,termsSections,type TermsAudience} from '@/lib/terms';
import './terms-consent.css';
export function TermsConsent({audience}:{audience:TermsAudience}){
 return <Consent key={audience} audience={audience}/>;
}
function Consent({audience}:{audience:TermsAudience}){
 const {revision}=useContext(CmsContext);const cms=useCms();
 const t=useText(),id=useId(),dialog=useRef<HTMLDialogElement>(null);
 const [accepted,setAccepted]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 const title=audience==='driver'?t('ข้อตกลงสำหรับคนขับ','Driver terms'):t('ข้อตกลงสำหรับผู้ใช้บริการ','Customer terms');
 return <div className="terms-consent"><input type="hidden" name="contentRevision" value={revision}/>
  <div className="auth-consent"><input id={id+'-check'} type="checkbox" name="consent" required checked={accepted} onChange={event=>{if(event.target.checked)setOpen(true);else setAccepted(false);}} aria-label={t('ยอมรับข้อตกลงและรับทราบนโยบายความเป็นส่วนตัว','Accept terms and acknowledge privacy notice')}/><div><label htmlFor={id+'-check'}>{accepted?t('ยอมรับข้อตกลงและรับทราบนโยบายความเป็นส่วนตัวแล้ว','Terms accepted and privacy notice acknowledged'):t('กรุณาอ่านและยอมรับข้อตกลงก่อนสมัคร','Please read and accept the terms before registering')}</label><button type="button" className="terms-read" onClick={()=>setOpen(true)}>{accepted?t('อ่านข้อตกลงอีกครั้ง','Read terms again'):t('อ่านข้อตกลงและยอมรับ','Read and accept terms')}</button></div></div>
  <dialog ref={dialog} className="terms-dialog" aria-labelledby={id+'-title'} onCancel={event=>{event.preventDefault();setOpen(false);}} onClick={event=>{if(event.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)setOpen(false);}}}>
   <header><div><h2 id={id+'-title'}>{title}</h2><p>JUMBO GO · {t('ฉบับ','Version')} {TERMS_VERSION}{revision>0?` / CMS ${revision}`:null}</p></div><button type="button" onClick={()=>setOpen(false)} aria-label={t('ปิดข้อตกลง','Close terms')}><X size={22}/></button></header>
   <div className="terms-dialog-body" tabIndex={0} aria-label={t('เนื้อหาข้อตกลง เลื่อนเพื่ออ่าน','Terms content, scroll to read')}>
    <p className="terms-dialog-summary">{t('อ่านเงื่อนไขด้านล่างก่อนกดยอมรับ ปุ่มนี้ยืนยันข้อตกลงในฟอร์มเท่านั้น ยังไม่สร้างบัญชีหรือเรียกเก็บเงิน','Read the terms below before accepting. This confirms the form checkbox only; it does not create an account or charge you.')}</p>
    {termsSections(audience).map((section,index)=><section key={section.id}><h3>{index+1}. {t(...section.title)}</h3>{section.paragraphs.map((p,i)=><p key={i}>{t(...p)}</p>)}</section>)}
    <section><h3>{t('ผู้ให้บริการและการติดต่อ','Operator and contact')}</h3><p>JUMBO GO · <a href={'mailto:'+cms('contact.email','jumbogo168@gmail.com')}>{cms('contact.email','jumbogo168@gmail.com')}</a></p><p>{t('ฉบับเตรียมเปิดใช้: ชื่อบุคคลหรือนิติบุคคลผู้ให้บริการและที่อยู่ติดต่ออยู่ระหว่างยืนยัน ก่อนนำไปใช้เป็นข้อตกลงบริการจริงต้องตรวจทานข้อมูลส่วนนี้และเงื่อนไขทางธุรกิจให้ครบถ้วน','Pre-launch edition: the operator’s legal name and contact address are awaiting confirmation. These details and commercial terms require review before use as live service terms.')}</p></section>
    <p><Link href="/privacy" target="_blank" rel="noopener noreferrer">{t('อ่านนโยบายความเป็นส่วนตัว (เปิดแท็บใหม่)','Read privacy notice (new tab)')}</Link> · <Link href={'/terms/'+audience} target="_blank" rel="noopener noreferrer">{t('เปิดข้อตกลงหน้าเต็ม','Open full terms')}</Link></p>
   </div>
   <footer><p>{t('เมื่อกดยอมรับ คุณยอมรับข้อตกลงและรับทราบนโยบายความเป็นส่วนตัว ระบบบันทึกฉบับและเวลาเมื่อสมัครสำเร็จ','Accepting confirms the terms and acknowledgment of the privacy notice. The version and time are recorded when registration succeeds.')}</p><div><button type="button" className="button secondary" onClick={()=>setOpen(false)}>{t('กลับไปก่อน','Go back')}</button><button type="button" className="button primary" onClick={()=>{setAccepted(true);setOpen(false);}}><Check size={18}/>{t('ยอมรับข้อตกลง','Accept terms')}</button></div></footer>
  </dialog>
 </div>;
}
