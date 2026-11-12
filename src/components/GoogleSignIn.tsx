import { useEffect, useRef, useState } from 'react';

interface GoogleCredentialResponse { credential?: string }
interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
      renderButton(element: HTMLElement, options: { theme: string; size: string; text: string; shape: string; width: number }): void;
    };
  };
}

declare global {
  interface Window { google?: GoogleIdentityApi }
}

interface Props {
  disabled?: boolean;
  onCredential: (idToken: string) => Promise<void>;
  onError: (message: string) => void;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export function GoogleSignIn({ disabled, onCredential, onError }: Props) {
  const button = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setLoadError('Google sign-in is not configured.');
      return;
    }

    let active = true;
    const renderButton = () => {
      if (!active || !window.google || !button.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (!response.credential) {
            onError('Google did not return a sign-in credential. Please try again.');
            return;
          }
          void onCredential(response.credential);
        },
      });
      button.current.replaceChildren();
      window.google.accounts.id.renderButton(button.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: Math.max(220, Math.min(360, button.current.clientWidth || 320)),
      });
      setLoadError('');
    };

    if (window.google) {
      renderButton();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = renderButton;
      script.onerror = () => setLoadError('Google sign-in could not be loaded. Check your connection and try again.');
      document.head.appendChild(script);
    }

    return () => { active = false; };
  }, [onCredential, onError]);

  return (
    <div className={`google-sign-in${disabled ? ' disabled' : ''}`}>
      {loadError ? <p className="error-text" role="alert">{loadError}</p> : <div ref={button} aria-disabled={disabled} />}
      {disabled && <span className="google-sign-in-cover" aria-hidden="true" />}
    </div>
  );
}
