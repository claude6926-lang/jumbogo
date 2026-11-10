'use client';
import Link from 'next/link';
import {TermsConsent} from './terms-consent';
import {useEffect,useState} from 'react';
import {ArrowRight,Building2,Eye,EyeOff,MapPin,ShieldCheck,Truck,User} from 'lucide-react';
import {useText} from '@/lib/i18n';
import {AuthShell,AuthErrorMessage,authApi} from './auth-shell';
import './registration-premium.css';

export function CustomerRegister(){return <AuthShell wide><RegistrationForm/></AuthShell>;}
function RegistrationForm(){
 const t=useText();const[type,setType]=useState<'individual'|'business'>('individual');const[show,setShow]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[providers,setProviders]=useState({google:false,facebook:false});
 useEffect(()=>{authApi<typeof providers>('providers').then(setProviders).catch(()=>{});},[]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const text=(key:string)=>String(data.get(key)||'');setError('');
  if(text('password')!==text('confirmPassword')){setError('PASSWORD_MISMATCH');form.querySelector<HTMLInputElement>('[name=confirmPassword]')?.focus();return;}
  setBusy(true);try{
   const result=await authApi<{next:string}>('register',{name:text('name'),email:text('email'),phone:text('phone'),password:text('password'),confirmPassword:text('confirmPassword'),role:'user',consent:data.get('consent')==='on',contentRevision:Number(data.get('contentRevision')||0),customerDetails:{customerType:type,companyName:text('companyName'),address:text('address'),subdistrict:text('subdistrict'),district:text('district'),province:text('province'),postalCode:text('postalCode')}});
   window.location.assign(result.next);
  }catch(e){setError(e instanceof Error?e.message:'INTERNAL_ERROR');setBusy(false);}
 }
 return <div className="customer-registration"><h1>{t('สร้างบัญชีผู้ใช้บริการ','Create your customer account')}</h1><p className="auth-intro">{t('กรอกข้อมูลติดต่อให้ครบ เพื่อให้ทุกการขนส่งประสานงานได้ง่ายขึ้น','Add your contact details to make every delivery easier to coordinate.')}</p>
 <div className="auth-role-tabs"><Link href="/user/register" className="active"><User size={17}/>{t('ผู้ใช้บริการ','Customer')}</Link><Link href="/driver/register"><Truck size={17}/>{t('ผู้ขับขี่','Driver')}</Link></div>
 <aside className="registration-premium" aria-label={t('สมาชิก Premium','Premium membership')}><div><span className="registration-premium-label">JUMBO GO PREMIUM</span><h2>{t('เพิ่มความคล่องตัวให้ธุรกิจของคุณ','More flexibility for your business')}</h2><p>{t('จัดการทีมคนขับ ส่งงานตรง และโพสต์งานซ้ำตามสิทธิ์แพ็กเกจ สมัครบัญชีก่อน แล้วเลือกอัปเกรดได้ภายหลัง','Manage your driver team, dispatch directly and repeat posts with plan benefits. Create an account first and upgrade when ready.')}</p><small>{t('199 บาท / 30 วัน · ชำระแยกจาก Wallet · ไม่มีต่ออายุอัตโนมัติ','THB 199 / 30 days · Separate from Wallet · No automatic renewal')}</small></div><Link href="/premium">{t('ดูสิทธิ์ Premium','Explore Premium')}<ArrowRight size={16} aria-hidden="true"/></Link></aside>
 <p className="notice">{t('สมัครสำเร็จ รับเครดิตต้อนรับ 100 บาทใน Wallet อัตโนมัติ ใช้เป็นส่วนลดค่าขนส่ง รับครั้งเดียวต่อบัญชี','Register successfully and receive ฿100 wallet credit automatically for delivery discounts. Once per account.')}</p>
 <form className="auth-form customer-registration-form" onSubmit={submit}>
 <fieldset><legend><User size={18}/>{t('1. ข้อมูลผู้สมัคร','1. Your details')}</legend><p className="registration-hint">{t('กรุณากรอกทุกช่อง เว้นแต่ระบุว่าไม่บังคับ','Complete all fields unless marked optional.')}</p>
 <div className="customer-type-options">{(['individual','business'] as const).map(value=><label key={value} className={type===value?'selected':''}><input type="radio" name="customerType" value={value} checked={type===value} onChange={()=>setType(value)}/>{value==='individual'?<User size={20}/>:<Building2 size={20}/>}<span><strong>{value==='individual'?t('บุคคลทั่วไป','Individual'):t('ธุรกิจ / บริษัท','Business / company')}</strong><small>{value==='individual'?t('ขนของส่วนตัว ย้ายบ้าน และอื่น ๆ','Personal deliveries, moving and more'):t('จัดส่งสินค้าและประสานงานธุรกิจ','Deliveries for your business')}</small></span></label>)}</div>
 <div className="registration-grid">
 {type==='business'&&<label className="field registration-full">{t('ชื่อบริษัท / ชื่อร้านค้า','Company / shop name')}<input name="companyName" autoComplete="organization" minLength={2} maxLength={150} required placeholder={t('ชื่อธุรกิจที่ใช้ติดต่อ','Your business name')}/></label>}
 <label className="field registration-full">{type==='business'?t('ชื่อ–นามสกุลผู้ติดต่อ','Contact person’s full name'):t('ชื่อ–นามสกุล','Full name')}<input name="name" autoComplete="name" minLength={2} maxLength={100} required placeholder={t('กรอกชื่อและนามสกุล','Your first and last name')}/></label>
 <label className="field">{t('อีเมล','Email')}<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com"/></label>
 <label className="field">{t('เบอร์โทรศัพท์มือถือ','Mobile phone')}<input name="phone" type="tel" autoComplete="tel" pattern="(0[689][0-9]{8}|\+66[689][0-9]{8})" required placeholder="0812345678"/></label>
 </div></fieldset>
 <fieldset><legend><MapPin size={18}/>{t('2. ที่อยู่ติดต่อ','2. Contact address')}</legend><p className="registration-hint">{t('ใช้เป็นข้อมูลติดต่อของบัญชี เลือกจุดรับ–ส่งแต่ละงานได้อีกครั้งตอนจอง','Your account contact address. Choose pickup and drop-off locations separately when booking.')}</p><div className="registration-grid">
 <label className="field registration-full">{t('บ้านเลขที่ อาคาร ถนน / ซอย','House number, building, street')}<textarea name="address" autoComplete="street-address" minLength={10} maxLength={300} rows={2} required placeholder={t('เช่น 99/12 อาคารจัมโบ้ ถนนพหลโยธิน','e.g. 99/12 Jumbo Building, Phahonyothin Road')}/></label>
 <label className="field">{t('แขวง / ตำบล','Subdistrict')}<input name="subdistrict" autoComplete="address-level3" minLength={2} maxLength={80} required/></label>
 <label className="field">{t('เขต / อำเภอ','District')}<input name="district" autoComplete="address-level2" minLength={2} maxLength={80} required/></label>
 <label className="field">{t('จังหวัด','Province')}<input name="province" autoComplete="address-level1" minLength={2} maxLength={80} required placeholder={t('เช่น กรุงเทพมหานคร','e.g. Bangkok')}/></label>
 <label className="field">{t('รหัสไปรษณีย์','Postal code')}<input name="postalCode" autoComplete="postal-code" inputMode="numeric" pattern="[1-9][0-9]{4}" maxLength={5} required placeholder="10400"/></label>
 </div></fieldset>
 <fieldset><legend><ShieldCheck size={18}/>{t('3. ตั้งรหัสผ่าน','3. Secure your account')}</legend><div className="registration-grid">{(['password','confirmPassword'] as const).map(key=><label key={key} className="field">{key==='password'?t('รหัสผ่าน','Password'):t('ยืนยันรหัสผ่าน','Confirm password')}<div className="auth-password"><input name={key} type={show?'text':'password'} autoComplete="new-password" required minLength={10} maxLength={128} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{10,128}" onChange={()=>{if(error==='PASSWORD_MISMATCH')setError('');}}/><button type="button" aria-label={`${show?t('ซ่อน','Hide'):t('แสดง','Show')} ${key==='password'?t('รหัสผ่าน','password'):t('ยืนยันรหัสผ่าน','password confirmation')}`} aria-pressed={show} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>)}</div><p className="registration-hint">{t('อย่างน้อย 10 ตัวอักษร ประกอบด้วยตัวอักษรภาษาอังกฤษและตัวเลข','At least 10 characters, including English letters and numbers.')}</p></fieldset>
 <TermsConsent audience="user"/>
 <AuthErrorMessage code={error}/><button className="button primary full" disabled={busy}>{busy?t('กำลังสร้างบัญชี…','Creating your account…'):t('สร้างบัญชีผู้ใช้บริการ','Create customer account')}<ArrowRight size={18}/></button></form>
 <div className="auth-divider"><span>{t('หรือเริ่มต้นด้วยบัญชีโซเชียล','Or continue with a social account')}</span></div><div className="auth-social">{(['google','facebook'] as const).map(p=><button type="button" key={p} disabled={!providers[p]||busy} className={`social-button ${p}`} onClick={()=>window.location.assign(`/api/auth/oauth/${p}?role=user`)}><strong>{p==='google'?'G':'f'}</strong>{p==='google'?'Google':'Facebook'}</button>)}</div>
 <p className="auth-provider-note">{t('ผู้ใช้ใหม่ผ่าน Google หรือ Facebook ต้องกรอกข้อมูลเพิ่มเติม ช่องทางสีเทายังไม่เปิดใช้งาน','New Google and Facebook customers complete their details. Greyed-out providers are not enabled yet.')}</p><p className="auth-switch">{t('มีบัญชีอยู่แล้ว?','Already have an account?')} <Link href="/user/login">{t('เข้าสู่ระบบ','Sign in')}</Link></p><Link className="auth-guide" href="/#how-it-works">{t('ดูวิธีเริ่มใช้งาน','How to get started')}<ArrowRight size={15}/></Link>
 </div>;
}
