"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className="main-header">
      <div className="header-status">
        {session?.user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--google-active-pill)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--google-primary)',
              fontWeight: 600,
              fontSize: '14px',
              overflow: 'hidden'
            }}>
              {session.user.image ? (
                <img 
                  src={session.user.image} 
                  alt={session.user.name || ""} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              ) : (
                <User size={16} />
              )}
            </div>
            <span style={{ fontSize: '13px', color: 'var(--google-text-main)', fontWeight: 500 }}>
              {session.user.name} さん
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="btn-secondary"
              style={{
                width: 'auto',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                borderRadius: '100px',
                marginLeft: '8px'
              }}
            >
              <LogOut size={14} />
              ログアウト
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
