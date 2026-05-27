"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="app-layout">
      {/* 左サイドバー */}
      <Sidebar />

      {/* 右メインコンテナ */}
      <div className="app-container">
        {/* 上部ヘッダー */}
        <Header />

        {/* スクロール可能なメインコンテンツ */}
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
