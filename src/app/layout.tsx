import {ContentProvider} from '@/lib/cms-context';
import {AdminRoleSwitch} from '@/components/admin-role-switch';
import {publishedContent} from '@/lib/server/cms-store';
import type {Metadata} from 'next';
import '@fontsource/kanit/400.css';
import '@fontsource/kanit/500.css';
import '@fontsource/kanit/600.css';
import '@fontsource/kanit/700.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800-italic.css';
import './globals.css';
export async function generateMetadata():Promise<Metadata>{const {values}=await publishedContent();return {title:values['seo.title']||'JUMBO GO — เรียกรถขนของ ราคาคนไทย',description:values['seo.description']||'JUMBO GO แพลตฟอร์มเรียกรถขนส่ง ไทย–อังกฤษ',manifest:'/manifest.webmanifest',icons:{icon:values['brand.logo']||'/logo.png',apple:values['brand.logo']||'/logo.png'}};}
export default async function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body><ContentProvider initial={await publishedContent()}>{children}<AdminRoleSwitch/></ContentProvider></body></html>;}
