import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ClientDashboard from "./client-dashboard";
import Link from "next/link";
import { History, LayoutDashboard, Clock } from "lucide-react";

function getJstDateStringAndIsWeekend(dateObj: Date): { dateStr: string, isWeekend: boolean } {
  const t = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000);
  if (t.getUTCHours() < 5) t.setUTCDate(t.getUTCDate() - 1);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth() + 1;
  const d = t.getUTCDate();
  const day = t.getUTCDay();
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return {
    dateStr: `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}(${days[day]})`,
    isWeekend: day === 0 || day === 6
  };
}

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect("/login");
  }

  // Fetch today's records for this user based on session ID (JST ビジネスデー 5:00〜翌4:59)
  const now = new Date();
  const base = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  if (base.getUTCHours() < 5) base.setUTCDate(base.getUTCDate() - 1);
  
  const yyyy = base.getUTCFullYear();
  const mm = base.getUTCMonth();
  const dd = base.getUTCDate();
  
  const startOfDay = new Date(Date.UTC(yyyy, mm, dd, 5 - 9, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(yyyy, mm, dd + 1, 4 - 9, 59, 59, 999));

  const userId = (session.user as any).id;

  let records: any[] = [];
  let availableRestDays: string[] = [];

  if (userId) {
    records = await prisma.attendanceRecord.findMany({
      where: {
        userId: userId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    // 過去90日間のデータを取得して「代休チケット」の在庫を計算
    const ninetyDaysAgo = new Date(startOfDay.getTime() - 90 * 24 * 60 * 60 * 1000);
    const pastRecords = await prisma.attendanceRecord.findMany({
      where: {
        userId: userId,
        timestamp: { gte: ninetyDaysAgo }
      },
      orderBy: { timestamp: 'asc' }
    });

    const workedHolidays = new Set<string>();
    const consumedHolidays = new Set<string>();

    // 1. まず休日出勤日と消費ステータスを分類
    for (const r of pastRecords) {
      if (r.type === "CLOCK_IN") {
        const { dateStr, isWeekend } = getJstDateStringAndIsWeekend(r.timestamp);
        if (isWeekend) {
          workedHolidays.add(dateStr);
        }
      }
      if (r.type === "STATUS_DAIKYU" || r.type === "STATUS_FURIKYU") {
        if (r.note) {
          consumedHolidays.add(r.note);
        }
      }
    }

    // 2. 稼いだ休日出勤日から、消費済みのものを引く
    for (const dateStr of Array.from(workedHolidays)) {
      if (!consumedHolidays.has(dateStr)) {
        availableRestDays.push(dateStr);
      }
    }
  }

  return (
    <div className="container">
      <div className="card animate-fade-in">
        <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <div className="flex items-center gap-3">
            <Clock className="text-primary" size={24} />
            <h1 className="text-xl">勤怠管理システム</h1>
          </div>
          <div className="text-sm text-muted">
            {session.user.name}さん
          </div>
        </div>

        <div className="header-tabs">
          <Link href="/" className="header-tab active flex items-center gap-2">
            <LayoutDashboard size={18} /> 打刻と状況
          </Link>
          <Link href="/history" className="header-tab flex items-center gap-2">
            <History size={18} /> 月間履歴・集計
          </Link>
        </div>

        <ClientDashboard initialRecords={records} availableRestDays={availableRestDays} />
      </div>
    </div>
  );
}
