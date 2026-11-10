'use client';
import {useEffect,useState} from 'react';
import type {CustomerDetails} from '@/lib/auth-domain';
import {useText} from '@/lib/i18n';
import {authApi} from './auth-shell';
export function CustomerContactSummary(){const t=useText();const[details,setDetails]=useState<CustomerDetails|null>(null);useEffect(()=>{authApi<CustomerDetails|null>('customer-details').then(setDetails).catch(()=>{});},[]);if(!details)return null;return <section className="customer-saved-details"><h2>{t('ข้อมูลที่ใช้สมัครสมาชิก','Registration details')}</h2><p>{details.customerType==='business'?`${t('ธุรกิจ / บริษัท','Business / company')}: ${details.companyName}`:t('บุคคลทั่วไป','Individual')}</p><p>{details.address}<br/>{details.subdistrict} · {details.district}<br/>{details.province} {details.postalCode}</p></section>;}
