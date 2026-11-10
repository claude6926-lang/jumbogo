'use client';
import Link from 'next/link';
import {PromoManual} from './promo-manual';
import {VehicleRail} from './vehicle-rail';
import {useCms} from '@/lib/cms-context';
import {useState,useEffect} from 'react';
import {LanguageContext,useText,type Language} from '@/lib/i18n';
import {promoEnglish} from '@/lib/promo-translations';
import {Brand} from '@/components/ui';
import {Phone, MessageCircle, Facebook, ArrowUpRight} from 'lucide-react';
import './promo-landing.css';
import './promo-faq.css';
import './promo-header-actions.css';
const baseVehicles = {
  box: { name: 'กระบะตู้ทึบ', image: 'pickup-box.jpg', description: 'พื้นที่บรรทุกแบบปิด เหมาะกับการขนย้ายของใช้ในบ้าน กล่องสัมภาระ และสินค้าที่ต้องการหลีกเลี่ยงแดดและฝน', use: 'ย้ายบ้าน · คอนโด · ของใช้ทั่วไป', feature: 'กระบะพร้อมตู้บรรทุกแบบปิด' },
  pickup: { name: 'กระบะ', image: 'pickup.jpg', description: 'คล่องตัวสำหรับงานขนย้ายขนาดเล็ก พื้นที่กระบะเปิดช่วยให้จัดวางและยกสิ่งของได้สะดวก', use: 'ของใช้ไม่มาก · สินค้าชิ้นเล็ก', feature: 'กระบะเปิดโล่ง เข้าถึงของได้ง่าย' },
  cage: { name: 'กระบะคอก', image: 'pickup-cage.jpg', description: 'กระบะพร้อมโครงคอก เหมาะกับสิ่งของที่ต้องการพื้นที่จัดเรียง ควรแจ้งขนาดและลักษณะสิ่งของก่อนเลือกใช้บริการ', use: 'กล่องสินค้า · สิ่งของหลายชิ้น', feature: 'โครงคอกสูง พื้นที่บรรทุกเปิด' },
  jumbo: { name: 'จัมโบ้', image: 'truck-jumbo.jpg', description: 'รถตู้บรรทุกสำหรับงานที่ต้องการพื้นที่มากกว่ากระบะ เหมาะกับการขนย้ายเฟอร์นิเจอร์และสิ่งของหลายรายการ', use: 'เฟอร์นิเจอร์ · อุปกรณ์สำนักงาน', feature: 'ตู้บรรทุกแบบปิดขนาดกลาง' },
  large: { name: 'รถบรรทุกขนาดใหญ่', image: 'truck-large.jpg', description: 'ทางเลือกสำหรับงานขนส่งปริมาณมาก ควรตรวจสอบพื้นที่จอด จุดเข้ารับ และเส้นทางให้เหมาะกับขนาดรถ', use: 'สินค้าปริมาณมาก · งานขนย้ายใหญ่', feature: 'ตู้บรรทุกแบบปิดขนาดใหญ่' }
};
type VehicleKey = keyof typeof baseVehicles;
const vehicleKeys = Object.keys(baseVehicles) as VehicleKey[];
export function PromoLanding(){
const [language,setLanguage]=useState<Language>('th');
useEffect(()=>{if(localStorage.getItem('jumbo-language')==='en')setLanguage('en');},[]);
useEffect(()=>{document.documentElement.lang=language;},[language]);
return <LanguageContext.Provider value={language}><PromoContent language={language} onLanguage={value=>{setLanguage(value);localStorage.setItem('jumbo-language',value);}}/></LanguageContext.Provider>;
}
function PromoContent({language,onLanguage}:{language:Language;onLanguage:(value:Language)=>void}){
const content=useCms(),t=useText();
const cms=(key:string,fallback:string)=>key==='home.11'?t('คู่มือใช้งาน','User guide'):language==='en'&&promoEnglish[fallback]?content(key+'.en',promoEnglish[fallback]):content(key,fallback);
const vehicles=Object.fromEntries(Object.entries(baseVehicles).map(([key,value])=>[key,Object.fromEntries(Object.entries(value).map(([field,text])=>[field,cms('vehicle.'+key+'.'+field,field==='image'?'/promo/'+text:text)]))])) as typeof baseVehicles;
const [selected,setSelected]=useState<VehicleKey>('box');
const [menuOpen,setMenuOpen]=useState(false);
const vehicle=vehicles[selected];
return <div className="promo-page" id="top">
  <svg className="pm-svg-defs" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs>
    <symbol id="arrow" viewBox="0 0 24 24"><path d="M4 12h16m-6-6 6 6-6 6"/></symbol>
    <symbol id="home" viewBox="0 0 32 32"><path d="m3 14 13-11 13 11v15H19V19h-6v10H3Z"/></symbol>
    <symbol id="office" viewBox="0 0 32 32"><path d="M6 29V3h20v26M3 29h26M13 29v-7h6v7M11 8h2m6 0h2M11 13h2m6 0h2M11 18h2m6 0h2"/></symbol>
    <symbol id="box" viewBox="0 0 32 32"><path d="m3 9 13-6 13 6v15l-13 6-13-6Zm0 0 13 6 13-6M16 15v15M9 6l13 6"/></symbol>
  </defs></svg>
  <a className="pm-skip" href={cms("home.1","#main")}>{cms("home.2","ข้ามไปเนื้อหา")}</a>
  <header className="pm-header pm-wrap">
    <a className="pm-brand" href={cms("home.3","#top")} aria-label={t('JUMBO GO หน้าแรก','JUMBO GO home')}><Brand/></a>
    <button className="pm-menu-toggle" type="button" aria-controls="navigation" aria-expanded={menuOpen} aria-label={menuOpen?t("ปิดเมนู","Close menu"):t("เปิดเมนู","Open menu")} onClick={()=>setMenuOpen(!menuOpen)}><span></span><span></span></button>
    <nav className={menuOpen?"pm-open":""} onClick={()=>setMenuOpen(false)} onKeyDown={event=>{if(event.key==="Escape"){setMenuOpen(false);document.querySelector<HTMLButtonElement>(".promo-page .pm-menu-toggle")?.focus();}}} id="navigation" aria-label={t("เมนูหลัก","Main navigation")}>
      <a href={cms("home.6","#services")}>{cms("home.7","บริการของเรา")}</a><a href={cms("home.8","#vehicles")}>{cms("home.9","เลือกรถ")}</a><a href={cms("home.10","#steps")}>{cms("home.11","ขั้นตอนการใช้บริการ")}</a><Link href={cms("home.12","/driver/login")}>{cms("home.13","สำหรับคนขับ")}</Link>
      <a href="#contact" onClick={()=>setMenuOpen(false)}>{t('ติดต่อเรา','Contact us')}</a>
      <a href="#faq">{t('คำถามที่พบบ่อย','FAQ')}</a>
    </nav>
    <div className="pm-header-actions">
      <Link className="pm-button pm-header-premium" href="/user/register">{t('สมัครสมาชิก','Sign up')}</Link>
      <Link className="pm-button pm-header-login" href={cms("home.14","/user/login")}>{cms("home.15","เข้าสู่ระบบ")}<svg aria-hidden="true"><use href={cms("home.16","#arrow")}/></svg></Link>
    </div>
    <div className="language-switch pm-language" role="group" aria-label={t('ภาษา','Language')}>{(['th','en'] as const).map(lang=><button type="button" key={lang} className={language===lang?'active':''} aria-pressed={language===lang} onClick={()=>onLanguage(lang)}>{lang.toUpperCase()}</button>)}</div>
  </header>
  <main id="main">
    <section className="pm-hero pm-wrap" aria-labelledby="hero-title">
      <div className="pm-hero-copy">
        <h1 id="hero-title">{cms("home.17","ย้ายเรื่องใหญ่")}<br/><span>{cms("home.18","ให้เป็นเรื่องง่าย")}</span></h1>
        <p>{cms("home.19","ขนย้ายบ้าน คอนโด สำนักงาน และสินค้า")}<br/>{cms("home.20","เลือกรถให้เหมาะกับทุกการเดินทาง")}</p>
        <div className="pm-hero-actions"><Link className="pm-button pm-primary" href={cms("home.21","/user/home")}>{cms("home.22","เริ่มจองรถ")}<svg><use href={cms("home.23","#arrow")}/></svg></Link><a className="pm-button pm-outline" href={cms("home.24","#vehicles")}>{cms("home.25","ดูรถทั้งหมด")}</a></div>
      </div>
      <figure className="pm-hero-figure"><img src={cms("home.26","/promo/pickup-box.jpg")} alt={cms("home.27","รถกระบะตู้ทึบสีขาวติดโลโก้ JUMBO GO")} width="1448" height="1086" fetchPriority="high"/><figcaption>{cms("home.28","JUMBO GO / MOVE FORWARD")}</figcaption></figure>
    </section>
    <section id="services" className="pm-services pm-wrap" aria-label={t("บริการของเรา","Our services")}>
      <article><svg><use href={cms("home.29","#home")}/></svg><div><h2>{cms("home.30","ย้ายบ้านและคอนโด")}</h2><p>{cms("home.31","จากห้องเดิม สู่การเริ่มต้นครั้งใหม่")}</p></div></article>
      <article><svg><use href={cms("home.32","#office")}/></svg><div><h2>{cms("home.33","ย้ายสำนักงาน")}</h2><p>{cms("home.34","วางแผนย้ายพื้นที่ทำงานให้เป็นเรื่องง่าย")}</p></div></article>
      <article><svg><use href={cms("home.35","#box")}/></svg><div><h2>{cms("home.36","ขนส่งสินค้า")}</h2><p>{cms("home.37","เลือกรถให้เหมาะกับสินค้าของคุณ")}</p></div></article>
    </section>
    <section className="pm-vehicles pm-wrap pm-section" id="vehicles" aria-labelledby="vehicles-title">
      <h2 id="vehicles-title">{cms("home.38","รถที่ใช่")}<span>{cms("home.39","สำหรับของของคุณ")}</span></h2>
      <VehicleRail items={vehicleKeys.map(key=>({id:key,name:vehicles[key].name,image:vehicles[key].image}))} selected={selected} onSelect={id=>setSelected(id as VehicleKey)}/>
      <div className="pm-vehicle-panel" id="vehicle-panel" role="tabpanel" aria-labelledby={"tab-"+selected} tabIndex={0}>
        <img id="vehicle-image" src={vehicle.image} alt={vehicle.name+" JUMBO GO"} width="1448" height="1086" loading="lazy"/>
        <div className="pm-vehicle-details" aria-live="polite" aria-atomic="true"><span className="pm-vehicle-index" id="vehicle-index">{'0'+(vehicleKeys.indexOf(selected)+1)+' / 05'}</span><h3 id="vehicle-name">{vehicle.name}</h3><p id="vehicle-description">{vehicle.description}</p><dl><div><dt>{cms("home.40","เหมาะกับ")}</dt><dd id="vehicle-use">{vehicle.use}</dd></div><div><dt>{cms("home.41","ลักษณะรถ")}</dt><dd id="vehicle-feature">{vehicle.feature}</dd></div></dl><Link className="pm-button pm-primary" id="choose-vehicle" href={cms("home.42","/user/home")}>{cms("home.43","ไปเลือกรถและจอง")}<svg><use href={cms("home.44","#arrow")}/></svg></Link><p className="pm-fine">{cms("home.45","ควรตรวจสอบขนาดสิ่งของและน้ำหนักกับผู้ให้บริการก่อนจอง")}</p></div>
      </div>
    </section>
    <PromoManual/>
<section className="pm-planner pm-wrap pm-section" id="planner" aria-labelledby="planner-title"><div><h2 id="planner-title">{cms("home.57","พร้อมย้าย")}<br/><span>{cms("home.58","ไปด้วยกัน")}</span></h2><p>{cms("home.59","จองรถ ดูราคา และติดตามงาน")}<br/>{cms("home.60","ได้ในระบบ JUMBO GO เดียวกัน")}</p></div><div className="pm-booking-entry"><h3>{cms("home.61","เริ่มจองรถขนส่ง")}</h3><p>{cms("home.62","ระบุจุดรับ–ส่ง เลือกรถ และตรวจสอบราคาก่อนยืนยันการจอง")}</p><Link className="pm-button pm-primary" href={cms("home.63","/user/home")}>{cms("home.64","จองรถ / ไปที่ระบบของฉัน")}<svg><use href={cms("home.65","#arrow")}/></svg></Link><div className="pm-account-entry"><Link href={cms("home.66","/user/register")}>{cms("home.67","สมัครสมาชิก")}</Link><Link href={cms("home.68","/user/login")}>{cms("home.69","เข้าสู่ระบบผู้ใช้")}</Link></div><div className="pm-driver-entry"><h3>{cms("home.70","ร่วมขับรถกับ JUMBO GO")}</h3><Link href={cms("home.71","/driver/register")}>{cms("home.72","สมัครคนขับ")}</Link><Link href={cms("home.73","/driver/login")}>{cms("home.74","เข้าสู่ระบบคนขับ")}</Link></div></div></section>
    <section className="pm-contact pm-wrap pm-section" id="contact" aria-labelledby="contact-title">
      <h2 id="contact-title">{t("ติดต่อ","Contact ")}<span>{t("เรา","us")}</span></h2>
      <p>{t("สอบถามบริการขนส่งและขนย้ายกับทีม JUMBO GO","Ask the JUMBO GO team about transport and moving services")}</p>
      <div className="pm-contact-links">
        <a href="https://lin.ee/vgTxjKj" target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true"/><span><strong>LINE</strong><small>{t("แชทกับ JUMBO GO","Chat with JUMBO GO")}</small></span><ArrowUpRight aria-hidden="true"/></a>
        <a href="https://www.facebook.com/profile.php?id=61594781590357" target="_blank" rel="noopener noreferrer"><Facebook aria-hidden="true"/><span><strong>Facebook</strong><small>{t("ติดตามและส่งข้อความ","Follow us and send a message")}</small></span><ArrowUpRight aria-hidden="true"/></a>
        <a href="tel:0832452000"><Phone aria-hidden="true"/><span><strong>083-245-2000</strong><small>{t("โทรสอบถามบริการ","Call about our services")}</small></span><ArrowUpRight aria-hidden="true"/></a>
      </div>
    </section>
    <section className="pm-contact pm-wrap pm-section" aria-labelledby="premium-entry-title"><h2 id="premium-entry-title">{t("เพิ่มความสะดวกด้วย ","Do more with ")}<span>Premium</span></h2><p>{t("สำหรับบริษัทและผู้จัดการที่ต้องการจัดทีมคนขับ ส่งงานตรง และโพสต์งานซ้ำ","For businesses and managers who need driver teams, direct dispatch and repeat job posts.")}</p><div className="pm-hero-actions" style={{marginTop:24}}><Link className="pm-button pm-primary" href="/premium">{t("ดูแพ็กเกจ Premium","Explore Premium")}</Link></div><p style={{fontSize:13,marginTop:12}}>{t("ดูราคา สิทธิ์ และสถานะการเปิดรับสมัครก่อนตัดสินใจ","Review pricing, benefits and availability before joining.")}</p></section>
    <section className="pm-faq pm-wrap pm-section" id="faq" aria-labelledby="faq-title">
      <h2 id="faq-title">{t("คำถาม","Frequently ")}<span>{t("ที่พบบ่อย","asked questions")}</span></h2>
      <details><summary>{t("เริ่มเรียกรถขนส่งได้อย่างไร?","How do I book transport?")}</summary><p>{t("สมัครสมาชิกหรือเข้าสู่ระบบผู้ใช้ ระบุจุดรับและจุดส่ง เลือกประเภทรถ วันเวลา และข้อมูลผู้ติดต่อ จากนั้นตรวจสอบเส้นทางและราคาก่อนยืนยันการจอง","Create an account or sign in, enter pickup and drop-off, choose a vehicle and date, and provide contact details. Review the route and price before confirming.")}</p></details>
      <details><summary>{t("เรียกรถกับโพสต์งานหารถต่างกันอย่างไร?","How is booking different from posting a job?")}</summary><p>{t("เรียกรถเป็นการจองขนส่งตามเส้นทางและราคาที่ระบบคำนวณ ส่วนกระดานงานให้ลูกค้าหรือธุรกิจโพสต์รายละเอียดและราคา เพื่อให้คนขับพิจารณารับงาน ทั้งสองส่วนเป็นรายการแยกกัน","Booking uses a route and price calculated by the system. The job board lets customers or businesses post details and a price for drivers to accept. These are separate services.")}</p></details>
      <details><summary>{t("เพิ่มผู้ช่วยยกของและบริการขึ้นบันไดได้ไหม?","Can I add moving helpers and stair carrying?")}</summary><p>{t("เลือกผู้ช่วยคนแรกและเพิ่มจำนวนได้ในขั้นตอนเลือกรถ ผู้ช่วยคนละ 150 บาท ส่วนบริการยกขึ้นบันไดเลือกได้เมื่อเปิดให้บริการ โดยระบบแสดงอัตราต่อชั้นและรวมค่าบริการในราคาก่อนยืนยัน","Add the first helper and additional helpers when choosing a vehicle, at THB 150 per helper. Stair carrying is available when enabled. The per-floor rate and total are shown before confirmation.")}</p></details>
      <details><summary>{t("ชำระเงินและรับใบยืนยันค่าขนส่งอย่างไร?","How do I pay and receive a transport payment confirmation?")}</summary><p>{t("เลือกชำระด้วย Wallet หรือเงินสดตามตัวเลือกของงาน ใบยืนยันค่าขนส่งส่งไปยังอีเมลในบัญชีหลังงานเสร็จและยืนยันรับชำระแล้ว ไม่ใช่ใบเสร็จตอนเติม Wallet และไม่ใช่ใบกำกับภาษี","Pay using Wallet or cash according to the options for your booking. A transport payment confirmation is emailed after completion and payment verification. It is not a Wallet top-up receipt or a tax invoice.")}</p></details>
      <details><summary>{t("Premium เหมาะกับใคร และต่ออายุอย่างไร?","Who is Premium for, and how do I renew?")}</summary><p>{t("สำหรับบัญชีธุรกิจที่ต้องการจัดการคนขับประจำ ส่งงานตรง และโพสต์ซ้ำตามสิทธิ์แพ็กเกจ ราคา 199 บาทต่อ 30 วัน ชำระผ่าน Beam QR แยกจาก Wallet ต่ออายุด้วยการชำระใหม่ ไม่มีการตัดเงินอัตโนมัติ","For business accounts managing regular drivers, direct dispatch and repeat posts according to their plan. THB 199 per 30 days, paid via Beam QR separately from Wallet. Renew with a new payment; there is no automatic charge.")}</p></details>
    </section>
  </main>
  <footer className="pm-footer pm-wrap"><a className="pm-brand" href={cms("home.75","#top")} aria-label={t("JUMBO GO กลับด้านบน","JUMBO GO back to top")}><Brand/></a><p>{cms("home.78","จัมโบ้โก · ให้เรื่องขนของเป็นเรื่องง่าย")}</p><Link href={cms("home.79","/privacy")}>{cms("home.80","ความเป็นส่วนตัว")}</Link><Link href={cms("home.81","/terms/user")}>{cms("home.82","ข้อตกลงผู้ใช้")}</Link><Link href={cms("home.83","/terms/driver")}>{cms("home.84","ข้อตกลงคนขับ")}</Link><a className="pm-back-top" href={cms("home.85","#top")}>{cms("home.86","กลับด้านบน")}<svg><use href={cms("home.87","#arrow")}/></svg></a></footer>
</div>;
}

