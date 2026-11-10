import { App } from '@/components/app';
import { PasswordRecovery } from '@/components/password-recovery';
import { PromoLanding } from '@/components/promo-landing';
import { AuthPage } from '@/components/auth-form';
import { DriverEnrollment } from '@/components/driver-enrollment';
import { TermsPage } from '@/components/terms';
import { Policies } from '@/components/policies';
import { DriverReview } from '@/components/driver-review';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionForToken, driverApproved } from '@/lib/server/auth-store';
export default async function Page({ params }: {
    params: Promise<{
        slug?: string[];
    }>;
}) {
    const { slug } = await params;
    if (!slug?.length)
        return <PromoLanding />;
    const path = slug.join('/');
    if (path === 'auth/reset-password')
        return <PasswordRecovery reset/>;
    if (slug.length === 2 && slug[1] === 'forgot-password' && (slug[0] === 'user' || slug[0] === 'driver' || slug[0] === 'admin'))
        return <PasswordRecovery role={slug[0]}/>;
    if (path === 'admin/login')
        return <AuthPage role="user" mode="login" admin/>;
    if (path === 'terms/user' || path === 'terms/driver')
        return <TermsPage audience={path === 'terms/driver' ? 'driver' : 'user'}/>;
    if (path === 'privacy' || path === 'terms')
        return <Policies kind={path}/>;
    if (path === 'login' || path === 'register')
        return <AuthPage role="user" mode={path}/>;
    if (path === 'auth/complete')
        return <AuthPage role="user" mode="complete"/>;
    if ((slug[0] === 'user' || slug[0] === 'driver') && (slug[1] === 'login' || slug[1] === 'register'))
        return <AuthPage role={slug[0]} mode={slug[1]}/>;
    const user = (await sessionForToken((await cookies()).get('jumbo_session')?.value || ''));
    if (!user)
        redirect(slug[0] === 'admin' ? '/admin/login' : slug[0] === 'driver' ? '/driver/login' : '/user/login');
    if (slug[0] === 'admin' && user.role !== 'admin')
        redirect(`/${user.role}/home`);
    if (path === 'admin/drivers')
        return <DriverReview />;
    if (slug[0] === 'driver' && user.role !== 'driver')
        redirect(`/${user.role}/home`);
    if (slug[0] === 'user' && user.role === 'driver')
        redirect('/driver/home');
    if (user.role === 'driver' && (path === 'driver/verification' || !(await driverApproved(user))))
        return <DriverEnrollment />;
    return <App />;
}
