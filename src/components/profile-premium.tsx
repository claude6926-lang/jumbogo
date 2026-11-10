'use client';
import Link from 'next/link';
import {useText} from '@/lib/i18n';
export function ProfilePremium(){const t=useText();return <section className="panel account-form" aria-labelledby="profile-premium-title"><h2 id="profile-premium-title">{t('แพ็กเกจ Premium','Premium plan')}</h2><p>{t('สำหรับบริษัทและผู้จัดการ: จัดทีมคนขับ ส่งงานตรง และสร้างโพสต์ซ้ำ','For businesses and managers: manage regular drivers, assign jobs and repeat posts.')}</p><Link className="button primary" href="/premium">{t('ดูแพ็กเกจ / สมัคร Premium','View plans / Join Premium')}</Link><small className="muted">{t('ตรวจสอบสิทธิ์ ราคา และสถานะการเปิดรับสมัครได้ในหน้าแพ็กเกจ','Check benefits, pricing and enrollment availability on the plans page.')}</small></section>;}
