'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowRight,ArrowUpRight} from 'lucide-react';
import {Brand,VehicleImage} from './ui';
import {LanguageContext,type Language,useText} from '@/lib/i18n';
import './landing.css';
import {GettingStarted} from './getting-started';

const vehicles=[['กระบะ','Pickup'],['กระบะตู้ทึบ','Box pickup'],['กระบะคอก','Cage pickup'],['จัมโบ้','Jumbo'],['6 ล้อ','6-wheel']] as const;

export function Landing(){
 const [language,setLanguage]=useState<Language>('th');
 useEffect(()=>{if(localStorage.getItem('jumbo-language')==='en')setLanguage('en');},[]);
 useEffect(()=>{document.documentElement.lang=language;},[language]);
 function changeLanguage(value:Language){setLanguage(value);localStorage.setItem('jumbo-language',value);}
 return <LanguageContext.Provider value={language}><Welcome language={language} changeLanguage={changeLanguage}/></LanguageContext.Provider>;
}

function Welcome({language,changeLanguage}:{language:Language;changeLanguage:(value:Language)=>void}){
 const t=useText();
 const steps=[
  {title:t('ระบุจุดรับ–ส่ง','Set your route'),description:t('บอกเราว่าจะรับของที่ไหน และไปส่งที่ไหน','Tell us where to pick up and where your cargo needs to go.')},
  {title:t('เลือกรถและดูราคา','Choose a vehicle'),description:t('เลือกรถให้เหมาะกับงาน ดูราคาก่อนตัดสินใจ','Find the right fit for your cargo and see the estimate before booking.')},
  {title:t('ยืนยันและติดตามงาน','Book and stay connected'),description:t('ยืนยันการจอง ดูสถานะ และพูดคุยกับคนขับ','Confirm your booking, follow its status and chat with your driver.')},
 ];
 return <div className="landing-page">
  <a className="landing-skip" href="#welcome">{t('ข้ามไปเนื้อหา','Skip to content')}</a>
  <header className="landing-header">
   <Link href="/" aria-label={t('JUMBO GO หน้าโฮมเพจ','JUMBO GO homepage')}><Brand/></Link>
   <nav className="landing-nav" aria-label={t('เมนูหน้าโฮมเพจ','Homepage navigation')}>
    <a href="#services">{t('บริการของเรา','Our vehicles')}</a>
    <a href="#how-it-works">{t('วิธีใช้งาน','How it works')}</a>
   </nav>
   <div className="landing-header-actions">
    <div className="language-switch" aria-label={t('ภาษา','Language')}>
     <button className={language==='th'?'active':''} onClick={()=>changeLanguage('th')} aria-pressed={language==='th'}>TH</button>
     <button className={language==='en'?'active':''} onClick={()=>changeLanguage('en')} aria-pressed={language==='en'}>EN</button>
    </div>
    <div className="landing-account-links"><Link href="/user/register">{t('สมัครสมาชิก','Register')}</Link><Link href="/driver/register">{t('สมัครขับรถ','Drive with us')}</Link></div>
    <Link href="/user/login" className="button primary landing-enter">{t('เข้าสู่ระบบ','Sign in')}<ArrowRight size={17}/></Link>
   </div>
  </header>
  <main className="landing-main" id="welcome">
   <section className="landing-hero" aria-labelledby="welcome-heading">
    <img className="landing-fleet" src="/fleet.png" alt={t('รถกระบะและรถบรรทุกหลายขนาดหน้าโกดัง','Pickup and freight trucks outside a warehouse')}/>
    <div className="landing-hero-content">
     <h1 id="welcome-heading">{t('เรียกรถขนของ','MOVE ANYTHING.')}<span>{t('ราคาคนไทย','GO ANYWHERE.')}</span></h1>
     <p>{t('ทุกขนาด ทุกเส้นทาง','Every load. Every road.')}<br className="landing-mobile-break"/>{t(' ให้เรื่องขนของเป็นเรื่องง่าย',' Your next move, made simple.')}</p>
     <div className="landing-hero-actions">
      <Link href="/user/home" className="button primary">{t('เริ่มจองรถ','Start booking')}<ArrowRight size={23}/></Link>
      <a href="#services" className="landing-secondary">{t('ดูรถที่ให้บริการ','Explore our vehicles')}<ArrowUpRight size={19}/></a>
     </div>
    </div>
   </section>
   <section className="landing-vehicles" id="services" aria-label={t('ประเภทรถที่ให้บริการ','Available vehicle types')}>
    {vehicles.map(([th,en],index)=><div className="landing-vehicle" key={en}><h2>{t(th,en)}</h2><VehicleImage index={index}/></div>)}
   </section>
   <section className="landing-steps" aria-labelledby="steps-heading">
    <h2 id="steps-heading">{t('พร้อมส่ง','READY TO GO.')}<span>{t('ใน 3 ขั้นตอน','IN 3 STEPS.')}</span></h2>
    <ol>{steps.map((step,index)=><li key={index}><span className="landing-step-number">0{index+1}</span><h3>{step.title}</h3><p>{step.description}</p></li>)}</ol>
   </section>
   <GettingStarted/>
  </main>
  <footer className="landing-footer"><Link href="/" aria-label="JUMBO GO"><Brand/></Link><p>{t('พื้นที่ทดลอง • ยังไม่มีการจองรถจริง','Demo workspace • No real dispatch or payments')}</p><span>{t('ขนของอย่างมั่นใจ ไปกับเรา','Your cargo. Our commitment.')}</span></footer>
 </div>;
}
