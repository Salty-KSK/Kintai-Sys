"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, History, ShieldAlert } from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <Clock size={28} className="brand-icon" style={{ color: "var(--google-primary)" }} />
        <span className="brand-text">勤怠管理システム</span>
      </div>
      <nav className="sidebar-nav">
        <Link href="/" className={`nav-item ${pathname === "/" ? "active" : ""}`}>
          <Clock className="nav-icon" size={20} />
          <span className="nav-text">打刻と状況</span>
        </Link>
        <Link href="/history" className={`nav-item ${pathname === "/history" ? "active" : ""}`}>
          <History className="nav-icon" size={20} />
          <span className="nav-text">月間履歴・集計</span>
        </Link>
        <Link href="/admin" className={`nav-item ${pathname === "/admin" ? "active" : ""}`}>
          <ShieldAlert className="nav-icon" size={20} />
          <span className="nav-text">管理者設定</span>
        </Link>
      </nav>
    </aside>
  );
}
