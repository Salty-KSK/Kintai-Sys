"use client";

import { signIn } from "next-auth/react";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="container" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card max-w-sm w-full animate-slide-up">
        <h1 className="card-title">勤怠管理システムへログイン</h1>
        <p className="text-muted mb-6 text-center">所属している企業アカウント（Google）でログインしてください</p>
        <button 
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="btn-primary"
        >
          <LogIn size={20} />
          Googleアカウントでログイン
        </button>
      </div>
    </div>
  );
}
