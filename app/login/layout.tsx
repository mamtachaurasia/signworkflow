import type { Metadata } from 'next';
import LoginPage from './page';

export const metadata: Metadata = {
    title: 'Login',
    description: 'Log in to SignWorkflow.',
    robots: {
        index: false,
        follow: false,
    },
};

export default function LoginLayout(){
    return(<div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center py-16"><LoginPage/></div> )
}
