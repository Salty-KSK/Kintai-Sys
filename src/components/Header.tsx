"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className="main-header">
      <div className="header-status">
        {session?.user && (
          <div className="header-user-info">
            <div className="user-avatar">
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
            <span className="user-name">
              {session.user.name} さん
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="btn-logout"
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
