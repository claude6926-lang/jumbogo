import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {sessionForToken} from '@/lib/server/auth-store';
import {business} from '@/lib/server/company-store';
import {CompanyPanel} from '@/components/company-panel';
export const dynamic='force-dynamic';
export default async function Page(){const user=await sessionForToken((await cookies()).get('jumbo_session')?.value||'');if(!user)redirect('/user/login');try{await business(user);}catch{redirect('/user/home');}return <CompanyPanel/>;}
