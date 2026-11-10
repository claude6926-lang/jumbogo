'use client';

import {useState} from 'react';
import {QrCode,ShieldCheck} from 'lucide-react';
import {useText} from '@/lib/i18n';

export function TopupAmount({value,onChange,min=1}:{value:string;onChange:(value:string)=>void;min?:number}) {
 const t=useText();
 return <><div className="wallet-amount-options" role="group" aria-label={t('เลือกจำนวนเงิน','Choose an amount')}>
  {[100,300,500,1000].map(amount=><button type="button" key={amount} aria-pressed={Number(value)===amount} onClick={()=>onChange(String(amount))}>฿{amount.toLocaleString()}</button>)}
 </div><label className="field">{t('หรือระบุจำนวนเงินเอง (บาท)','Or enter an amount (THB)')}<input name="amount" type="number" inputMode="numeric" min={min} max={100000} step={1} value={value} onChange={e=>onChange(e.target.value)} required/><small>{t(`เติมได้ตั้งแต่ ${min} ถึง 100,000 บาท จำนวนเต็ม`,`Whole amounts from ฿${min} to ฿100,000`)}</small></label></>;
}

// Until a live provider is configured, show the intended flow without a payable QR.
export function WalletTopup({balance,loading}:{balance:number;loading:boolean}) {
 const t=useText();
 const [amount,setAmount]=useState('100');
 const total=Number(amount);
 const valid=Number.isInteger(total)&&total>=1&&total<=100000;
 return <div className="panel wallet-topup" id="wallet-topup">
  <div className="wallet-topup-heading"><div><h2>{t('เติมเครดิตอัตโนมัติ','Automatic wallet top-up')}</h2><p>{t('ชำระด้วย QR ไม่ต้องแนบสลิป ไม่ต้องรอเจ้าหน้าที่อนุมัติ','Pay by QR. No slip upload or staff approval.')}</p></div><QrCode size={28}/></div>
  <ol className="wallet-steps" aria-label={t('ขั้นตอนเติมเงิน','Top-up steps')}>
   <li className="active" aria-current="step"><span>1</span>{t('เลือกจำนวน','Amount')}</li>
   <li><span>2</span>{t('ชำระด้วย QR','Pay by QR')}</li>
   <li><span>3</span>{t('เครดิตเข้า','Credit added')}</li>
  </ol>
  <p className="notice wallet-provider-pending" role="status">{loading?t('กำลังตรวจช่องทางชำระเงิน…','Checking payment availability…'):t('การเติมเงินอัตโนมัติยังไม่เปิดให้บริการ ขณะนี้เลือกยอดเพื่อดูสรุปได้ แต่ยังสร้าง QR หรือชำระเงินไม่ได้','Automatic top-ups are not available yet. You can preview an amount, but cannot generate a QR or make a payment.')}</p>
  <div className="wallet-topup-layout">
   <div className="wallet-topup-fields"><h3>{t('เลือกจำนวนเครดิตที่ต้องการเติม','Choose your top-up amount')}</h3><TopupAmount value={amount} onChange={setAmount}/>
    <div className="wallet-topup-summary"><dl>
     <div><dt>{t('เครดิตปัจจุบัน','Current credit')}</dt><dd>฿{balance.toLocaleString()}</dd></div>
     <div><dt>{t('จำนวนที่เติม','Top-up amount')}</dt><dd>+฿{valid?total.toLocaleString():'—'}</dd></div>
     <div className="wallet-projected"><dt>{t('เครดิตหลังชำระสำเร็จ','Credit after successful payment')}</dt><dd>฿{valid?(balance+total).toLocaleString():'—'}</dd></div>
    </dl><small>{t('ยอดตัวอย่าง ยังไม่มีการชำระเงินหรือเพิ่มเครดิต','Preview only. No payment has been made or credit added.')}</small>{balance<0&&<p>{t('เงินที่เติมจะชำระยอดติดลบก่อน ส่วนที่เหลือใช้เป็นเครดิตค่าขนส่ง','Your top-up settles the negative balance first; the remainder is available for deliveries.')}</p>}</div>
    <button className="button primary wallet-pay-disabled" disabled aria-describedby="wallet-payment-availability"><QrCode size={18}/>{loading?t('กำลังตรวจสอบ…','Checking…'):t('ชำระด้วย QR — ยังไม่เปิดบริการ','Pay by QR — coming soon')}</button>
   </div>
   <aside className="wallet-topup-summary wallet-topup-fields"><h3>{t('QR สำหรับรายการของคุณ','Your payment QR')}</h3>
    <div className="auto-placeholder wallet-unavailable-qr"><QrCode size={54}/><strong>{t('QR จะแสดงที่นี่เมื่อเปิดบริการ','Your QR will appear here once available')}</strong><p id="wallet-payment-availability">{t('เมื่อเปิดบริการ ระบบจะสร้าง QR ตามจำนวนเงินที่เลือกสำหรับแต่ละรายการ','Once available, a QR will be generated for each payment with your selected amount.')}</p></div>
    <div className="wallet-confirmation-note"><ShieldCheck size={22}/><p>{t('หลังชำระสำเร็จ ระบบจะเพิ่มเครดิตอัตโนมัติเมื่อได้รับการยืนยันจากผู้ให้บริการชำระเงิน พร้อมอัปเดตยอดและประวัติให้คุณ','After payment succeeds, credit will be added automatically upon confirmation from the payment provider, with your balance and history updated.')}</p></div>
    <small>{t('การสแกน QR อย่างเดียวยังไม่เพิ่มเครดิต ต้องยืนยันชำระในแอปธนาคารให้สำเร็จก่อน','Scanning alone does not add credit. Complete the payment in your banking app.')}</small>
   </aside>
  </div>
 </div>;
}

