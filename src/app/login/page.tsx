"use client";

import { signIn } from "next-auth/react";
import { LogIn, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    setIsInIframe(window.self !== window.top);
  }, []);

  return (
    <div className="container" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card max-w-sm w-full animate-slide-up">
        <h1 className="card-title">勤怠管理へログイン</h1>
        {isInIframe ? (
          <>
            <p className="text-muted mb-6 text-center">
              ログインするには新しいタブで開いてください
            </p>
            <a
              href={window.location.origin}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ textDecoration: 'none', textAlign: 'center' }}
            >
              <ExternalLink size={20} />
              新しいタブで開いてログイン
            </a>
          </>
        ) : (
          <>
            <p className="text-muted mb-6 text-center">所属している企業アカウント（Google）でログインしてください</p>
            <button
              onClick={() => signIn('google', { callbackUrl: '/' })}
              className="btn-primary"
            >
              <LogIn size={20} />
              Googleアカウントでログイン
            </button>
          </>
        )}
      </div>
    </div>
  );
}
