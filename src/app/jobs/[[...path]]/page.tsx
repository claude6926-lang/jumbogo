import { JobBoard } from '@/components/job-board';
import { notFound } from 'next/navigation';
export default async function Page({params}:{params:Promise<{path?:string[]}>}) {
 const {path=[]}=await params;
 if(path.length>1||path.length===1&&!['new','mine'].includes(path[0])&&!/^[a-f0-9-]{36}$/.test(path[0]))notFound();
 return <JobBoard view={path[0]||'list'}/>;
}
