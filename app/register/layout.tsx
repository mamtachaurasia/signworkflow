import type { Metadata } from 'next';
import RegisterPage from './page';

export const metadata: Metadata = {
    title: 'Create Account',
    description: 'Create your SignWorkflow account.',
    robots: {
        index: false,
        follow: false,
    },
};

export default function RegisterLayout(){
    return(<div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center py-16"><RegisterPage/></div> )
}
