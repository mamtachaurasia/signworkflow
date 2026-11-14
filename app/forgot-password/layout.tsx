import type { Metadata } from 'next';
import ForgotPasswordPage from './page';

export const metadata: Metadata = {
    title: 'Forgot Password',
    description: 'Reset access to your SignWorkflow account.',
    robots: {
        index: false,
        follow: false,
    },
};

export default function ForgotPasswordLayout(){
    return(<div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center py-16"><ForgotPasswordPage/></div> )
}
