'use client';
import Link from 'next/link';
import {CmsContext,useCms} from '@/lib/cms-context';
import {textKey} from '@/lib/cms-key';
import {useContext,useEffect,useState} from 'react';
import {Brand} from './ui';
import {TERMS_VERSION,termsSections,type TermsAudience} from '@/lib/terms';
import './terms.css';
export function TermsPage({audience='user'}:{audience?:TermsAudience}){
 const [language,setLanguage]=useState<'th'|'en'>('th');
 useEffect(()=>{if(localStorage.getItem('jumbo-language')==='en')setLanguage('en');},[]);
 const {values,revision}=useContext(CmsContext);const cms=useCms();
 const t=(th:string,en:string)=>values[textKey(th,en)+'.'+language]??(language==='th'?th:en);
 const sections=termsSections(audience);
 return <div className="terms-page" lang={language}>
  <header className="terms-header"><Link href="/" aria-label={t('JUMBO GO หน้าแรก','JUMBO GO home')}><Brand/></Link><div><Link href="/">{t('กลับหน้าแรก','Home')}</Link><button type="button" onClick={()=>setLanguage(language==='th'?'en':'th')}>{language==='th'?'English':'ภาษาไทย'}</button></div></header>
  <main className="terms-main">
   <nav className="terms-audience" aria-label={t('เลือกข้อตกลง','Choose terms')}><Link aria-current={audience==='user'?'page':undefined} href="/terms/user">{t('ผู้ใช้บริการ','Customers')}</Link><Link aria-current={audience==='driver'?'page':undefined} href="/terms/driver">{t('คนขับ','Drivers')}</Link><Link href="/privacy">{t('ความเป็นส่วนตัว','Privacy')}</Link></nav>
   <h1>{audience==='user'?t('ข้อตกลงสำหรับผู้ใช้บริการ','Customer terms'):t('ข้อตกลงสำหรับคนขับ','Driver terms')}</h1>
   <p className="terms-version">JUMBO GO · {t('ฉบับปรับปรุง 11 ตุลาคม 2569','Revised 11 October 2026')} · {TERMS_VERSION}{revision>0?` / CMS ${revision}`:null}</p>
   <p className="terms-intro">{t('อ่านเงื่อนไขที่เกี่ยวข้องกับบทบาทของคุณก่อนสมัครหรือทำรายการ และตรวจราคา สถานะงาน และนโยบายที่แสดงในระบบทุกครั้ง','Read the terms for your role before registering or transacting. Check the price, job status and displayed policies each time.')}</p>
   <div className="terms-highlights"><p><strong>{t('แจ้งยกเลิกล่วงหน้า','Cancellation notice')}</strong>{t('อย่างน้อย 30 นาทีก่อนนัดรับงาน','At least 30 minutes before scheduled pickup')}</p><p><strong>{audience==='user'?t('เครดิตผู้ใช้ใหม่','New customer credit'):t('ก่อนเริ่มรับงาน','Before accepting jobs')}</strong>{audience==='user'?t('100 บาท ครั้งเดียวต่อบัญชี','฿100 once per account'):t('ต้องผ่านการตรวจสอบคนขับและเอกสาร','Driver and document approval required')}</p><p><strong>{t('ติดต่อและขอทบทวน','Support and review')}</strong><a href={'mailto:'+cms('contact.email','jumbogo168@gmail.com')}>{cms('contact.email','jumbogo168@gmail.com')}</a></p></div>
   <div className="terms-layout"><aside><nav aria-label={t('สารบัญข้อตกลง','Terms contents')}><h2>{t('สารบัญ','Contents')}</h2>{sections.map((section,index)=><a href={'#'+section.id} key={section.id}>{index+1}. {t(...section.title)}</a>)}<a href="#operator">{t('ข้อมูลผู้ให้บริการและการติดต่อ','Operator and contact')}</a></nav></aside>
   <article>{sections.map((section,index)=><section id={section.id} key={section.id}><h2>{index+1}. {t(...section.title)}</h2>{section.paragraphs.map((text,i)=><p key={i}>{t(...text)}</p>)}</section>)}
    <section id="operator"><h2>{t('ข้อมูลผู้ให้บริการและการติดต่อ','Operator and contact')}</h2><p>{t('ชื่อบริการ: JUMBO GO • อีเมลรับเรื่องร้องเรียน:','Service: JUMBO GO • Complaints email:')} <a href={'mailto:'+cms('contact.email','jumbogo168@gmail.com')}>{cms('contact.email','jumbogo168@gmail.com')}</a></p><p>{t('ติดต่อได้ทางอีเมล หรือศูนย์ช่วยเหลือหลังเข้าสู่ระบบ โดยแนบเลขงานและรายละเอียดปัญหา','Contact us by email or through the signed-in help center with your job reference and issue details.')}</p><p className="terms-review-note">{t('ฉบับเตรียมเปิดใช้: ชื่อบุคคลหรือนิติบุคคลผู้ให้บริการและที่อยู่ติดต่ออยู่ระหว่างยืนยัน ก่อนนำไปใช้เป็นข้อตกลงบริการจริงต้องตรวจทานข้อมูลส่วนนี้และเงื่อนไขทางธุรกิจให้ครบถ้วน','Pre-launch edition: the operator’s legal name and contact address are awaiting confirmation. These details and commercial terms require review before use as live service terms.')}</p></section>
    <p className="terms-record-note">{t('เมื่อสมัครและทำเครื่องหมายยอมรับ ระบบบันทึกเลขฉบับข้อตกลงตามบทบาท พร้อมวันเวลา และการรับทราบนโยบายความเป็นส่วนตัว การเปิดอ่านหน้านี้อย่างเดียวไม่ใช่การยอมรับ','When you register and check acceptance, the system records your role-specific terms version, timestamp and privacy acknowledgment. Viewing this page alone is not acceptance.')}</p>
    <div className="terms-actions"><Link className="button primary" href={`/${audience}/register`}>{t('กลับไปสมัครสมาชิก','Go to registration')}</Link><Link href={`/${audience}/login`}>{t('เข้าสู่ระบบ','Sign in')}</Link><button type="button" onClick={()=>window.print()}>{t('พิมพ์ / บันทึก PDF','Print / Save PDF')}</button></div>
   </article></div>
  </main>
 </div>;
}
