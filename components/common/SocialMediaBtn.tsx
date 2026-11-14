import { Button } from "@ui";
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { GoogleOAuthProvider } from '@react-oauth/google';
const SocialMediaBtn = () => {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    return (
        <div className="flex gap-3 text-sm justify-center">
            {/* <Button size="sm" type="button" variant="outline" className={socialButtonClassName}>
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                >
                    <path
                        d="M16.5 9.0525C16.5 4.86 13.14 1.5 8.9475 1.5C4.755 1.5 1.5 4.86 1.5 9.0525C1.5 12.8175 4.245 15.945 7.83 16.5375V11.25H5.925V9.0525H7.83V7.35C7.83 5.475 8.9475 4.44 10.6575 4.44C11.475 4.44 12.33 4.59 12.33 4.59V6.4275H11.385C10.455 6.4275 10.1625 7.005 10.1625 7.5975V9.015H12.2475L11.9175 11.2125H10.1625V16.5C13.755 15.945 16.5 12.8175 16.5 9.0525Z"
                        fill="#1877F2"
                    />
                </svg>
                Facebook
            </Button> */}

           
                {googleClientId ? (
                    <GoogleOAuthProvider clientId={googleClientId}>
                        <GoogleSignInButton />
                    </GoogleOAuthProvider>
                ) : (
                    <Button size="sm"
                        type="button"
                        variant="outline"
                        disabled
                        className="h-10 w-full justify-center text-xs text-slate-500"
                        title="Google sign-in is not configured"
                    >
                        Google unavailable
                    </Button>
                )}
           

            {/* <Button size="sm" type="button" variant="outline" className={socialButtonClassName}>
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                >
                    <path d="M9 1.5H1.5V9H9V1.5Z" fill="#F25022" />
                    <path d="M16.5 1.5H9V9H16.5V1.5Z" fill="#7FBA00" />
                    <path d="M9 9H1.5V16.5H9V9Z" fill="#00A4EF" />
                    <path d="M16.5 9H9V16.5H16.5V9Z" fill="#FFB900" />
                </svg>
                Microsoft
            </Button> */}
        </div>
    )
}

export default SocialMediaBtn;
