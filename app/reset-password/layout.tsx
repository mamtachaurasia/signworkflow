import type { Metadata } from 'next';
import ResetPasswordPage from './page';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Choose a new password for your SignWorkflow account.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ResetPasswordLayout() {
  return (
    <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center py-16">
      <ResetPasswordPage />
    </div>
  );
}
