'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowRight,KeyRound} from 'lucide-react';
import {AuthShell,authApi} from './auth-shell';
import {useText} from '@/lib/i18n';

type Role='user'|'driver'|'admin';
export function PasswordRecovery({reset=false,role='user'}:{reset?:boolean;role?:Role}){return <AuthShell><Recovery reset={reset} initialRole={role}/></AuthShell>;}
function Recovery({reset,initialRole}:{reset:boolean;initialRole:Role}){
 const t=useText();const[role,setRole]=useState(initialRole);const[token,setToken]=useState('');const[ready,setReady]=useState(!reset);const[mode,setMode]=useState('');const[busy,setBusy]=useState(false);const[done,setDone]=useState(false);const[error,setError]=useState('');const[next,setNext]=useState(`/${initialRole}/login`);
 useEffect(()=>{
  if(reset){const params=new URLSearchParams(location.hash.slice(1));const value=params.get('token')||'';setToken(value);const r=params.get('role');if(r==='user'||r==='driver'||r==='admin'){setRole(r);setNext(`/${r}/login`);}setReady(true);if(!/^[a-f0-9]{64}$/.test(value))setError('RESET_EXPIRED');}
  else authApi<{delivery:string}>('recovery').then(r=>setMode(r.delivery)).catch(()=>setMode('unavailable'));
 },[reset]);
 const errors:Record<string,string>={RESET_EXPIRED:t('ลิงก์ไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่','This link is invalid, expired or already used. Request a new link.'),RESET_NOT_CONFIGURED:t('ยังไม่เปิดบริการส่งอีเมล กรุณาติดต่อผู้ดูแล','Password recovery is not configured. Contact support.'),RATE_LIMIT:t('ส่งคำขอบ่อยเกินไป กรุณาลองใหม่ภายหลัง','Too many requests. Please try again later.'),MISMATCH:t('รหัสผ่านทั้งสองช่องไม่ตรงกัน','Passwords do not match.'),VALIDATION_ERROR:t('รหัสผ่านต้องยาว 10–128 ตัวอักษร มีตัวอักษรอังกฤษและตัวเลข','Use 10–128 characters with English letters and numbers.')};
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setError('');const form=new FormData(e.currentTarget);if(reset&&form.get('password')!==form.get('confirmPassword')){setError('MISMATCH');return;}setBusy(true);try{const result=await authApi<{next?:string;delivery?:string}>(reset?'reset-password':'forgot-password',reset?{token,password:form.get('password'),confirmPassword:form.get('confirmPassword')}:{email:form.get('email'),role});if(result.next)setNext(result.next);if(result.delivery)setMode(result.delivery);setDone(true);}catch(e){setError(e instanceof Error?e.message:'INTERNAL_ERROR');}finally{setBusy(false);}}
 return <div className="auth-form-wrap"><KeyRound size={30}/><h1>{done&&reset?t('ตั้งรหัสผ่านใหม่แล้ว','Password updated.'):reset?t('ตั้งรหัสผ่านใหม่','Set a new password'):t('ลืมรหัสผ่าน?','Forgot password?')}</h1><p className="auth-intro">{reset?t('ลิงก์มีอายุ 15 นาที และใช้ได้ครั้งเดียว','Your link is valid for 15 minutes and can be used once.'):t('กรอกอีเมลที่ใช้สมัครบัญชีด้วยรหัสผ่าน','Enter the email used for your password-based account.')}</p>
 {error&&<div className="auth-error" role="alert">{errors[error]||t('ทำรายการไม่สำเร็จ กรุณาลองใหม่','Unable to complete the request. Try again.')}</div>}
 {!reset&&mode==='local-file'&&<p className="notice">{t('โหมดเดโมบนเครื่อง: ไม่ส่งอีเมลจริง ผู้ดูแลเปิดลิงก์ได้จากไฟล์ใน data/reset-outbox','Local demo: no email is sent. The operator can open the link from a file in data/reset-outbox.')}</p>}
 {!reset&&mode==='unavailable'&&<p className="auth-error">{errors.RESET_NOT_CONFIGURED}</p>}
 {done?<div role="status"><p>{reset?t('กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่ ออกจากระบบเดิมทุกอุปกรณ์แล้ว','Sign in with your new password. Previous sessions have been signed out.'):mode==='local-file'?t('รับคำขอแล้ว หากมีบัญชีที่ใช้รหัสผ่านตรงกัน ลิงก์จะอยู่ในไฟล์เดโมบนเครื่อง','Request received. If a matching password account exists, a link is saved in the local demo outbox.'):t('หากมีบัญชีที่ใช้รหัสผ่านตรงกับอีเมลนี้ คุณจะได้รับลิงก์ตั้งรหัสใหม่ โปรดตรวจกล่องจดหมายและสแปม','If a matching password account exists, you will receive a reset link. Check your inbox and spam folder.')}</p><Link href={next} className="button primary">{t('กลับเข้าสู่ระบบ','Back to sign in')}<ArrowRight size={17}/></Link></div>:<form className="auth-form" onSubmit={submit}>
 {reset?<>{['password','confirmPassword'].map((name,i)=><label className="field" key={name}>{i?t('ยืนยันรหัสผ่านใหม่','Confirm new password'):t('รหัสผ่านใหม่','New password')}<input name={name} type="password" autoComplete="new-password" required minLength={10} maxLength={128} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{10,128}"/></label>)}<small>{t('อย่างน้อย 10 ตัวอักษร มีตัวอักษรอังกฤษและตัวเลข','At least 10 characters with English letters and numbers.')}</small></>:<label className="field">{t('อีเมล','Email')}<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>}
 <button className="button primary full" disabled={busy||!ready||(!reset&&(!mode||mode==='unavailable'))||(reset&&!token)}>{busy?t('กำลังดำเนินการ…','Please wait…'):reset?t('บันทึกรหัสผ่านใหม่','Save new password'):t('ขอลิงก์ตั้งรหัสผ่านใหม่','Request reset link')}<ArrowRight size={18}/></button></form>}
 {reset&&!done&&<Link className="auth-guide" href={`/${role}/forgot-password`}>{t('ขอลิงก์ใหม่','Request a new link')}</Link>}
 {!reset&&<p className="auth-provider-note">{t('หากสมัครผ่าน Google หรือ Facebook ให้เข้าสู่ระบบผ่านช่องทางเดิม การตั้งรหัสผ่านของ Google/Facebook ต้องทำกับผู้ให้บริการนั้น','If you signed up with Google or Facebook, continue with that provider. Recover its password directly with the provider.')}</p>}
 {!done&&<Link className="auth-guide" href={`/${role}/login`}>{t('กลับเข้าสู่ระบบ','Back to sign in')}</Link>}
 </div>;
}
