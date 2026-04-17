import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { History, LayoutDashboard, Clock } from "lucide-react";
import { calculateDailyStats, formatTime } from "@/lib/attendanceCalc";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect("/login");
  }

  const userId = (session.user as any).id;

  // 締め日ロジック (前月26日 〜 当月25日)
  const now = new Date();
  const bizNow = new Date(now);
  if (bizNow.getHours() < 5) bizNow.setDate(bizNow.getDate() - 1);

  const currentYear = bizNow.getFullYear();
  const currentMonth = bizNow.getMonth(); // 0-indexed
  const currentDate = bizNow.getDate();

  let periodStart: Date;
  let periodEnd: Date;

  if (currentDate >= 26) {
    periodStart = new Date(currentYear, currentMonth, 26, 5, 0, 0, 0);
    periodEnd = new Date(currentYear, currentMonth + 1, 26, 4, 59, 59, 999);
  } else {
    periodStart = new Date(currentYear, currentMonth - 1, 26, 5, 0, 0, 0);
    periodEnd = new Date(currentYear, currentMonth, 26, 4, 59, 59, 999);
  }

  let records: any[] = [];
  if (userId) {
    records = await prisma.attendanceRecord.findMany({
      where: {
        userId: userId,
        timestamp: {
          gte: periodStart,
          lte: periodEnd
        }
      },
      orderBy: {
        timestamp: 'desc'
      }
    });
  }

  // Business Day (5:00 ~ 28:59) でグループ化
  const groupedRecords: Record<string, any[]> = {};
  records.forEach(r => {
    const d = new Date(r.timestamp);
    if (d.getHours() < 5) d.setDate(d.getDate() - 1);
    const dateStr = d.toLocaleDateString('ja-JP');
    if (!groupedRecords[dateStr]) groupedRecords[dateStr] = [];
    groupedRecords[dateStr].push(r);
  });
  let totalWorking = 0;
  let totalRegular = 0;
  let totalOvertime = 0;
  let totalNight = 0;
  
  Object.values(groupedRecords).forEach(dailyRecords => {
    const stats = calculateDailyStats(dailyRecords);
    totalWorking += stats.workingMinutes;
    totalRegular += stats.regularMinutes;
    totalOvertime += stats.overtimeMinutes;
    totalNight += stats.nightMinutes;
  });

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
          <Link href="/" className="header-tab flex items-center gap-2">
            <Clock size={18} /> 打刻と状況
          </Link>
          <Link href="/history" className="header-tab active flex items-center gap-2">
            <History size={18} /> 月間履歴・詳細集計
          </Link>
        </div>

        {/* コンパクトで洗練された累計サマリーバー */}
        <div className="mb-6 flex flex-wrap md:flex-nowrap items-center justify-between gap-4 p-3 bg-white border rounded shadow-sm">
          <div className="flex items-center gap-2 px-2 border-r pr-6 border-gray-100">
            <span className="text-sm font-bold text-muted">勤務累計</span>
            <span className="text-xs text-muted">({periodStart.getMonth() + 1}/26〜{periodEnd.getMonth() + 1}/25)</span>
          </div>
          <div className="flex flex-wrap items-center gap-6 px-2 w-full justify-around text-sm">
            <div className="flex flex-col md:flex-row md:items-baseline gap-1">
              <span className="text-xs text-muted">総実働</span>
              <span className="font-black text-xl text-primary">{formatTime(totalWorking)}</span>
            </div>
            <div className="flex flex-col md:flex-row md:items-baseline gap-1">
              <span className="text-xs text-muted">所定</span>
              <span className="font-bold text-lg">{formatTime(totalRegular)}</span>
            </div>
            <div className="flex flex-col md:flex-row md:items-baseline gap-1">
              <span className="text-xs text-muted">残業</span>
              <span className="font-bold text-lg" style={{ color: totalOvertime > 0 ? 'var(--danger)' : 'inherit' }}>{formatTime(totalOvertime)}</span>
            </div>
            <div className="flex flex-col md:flex-row md:items-baseline gap-1">
              <span className="text-xs text-muted">深夜</span>
              <span className="font-bold text-lg">{formatTime(totalNight)}</span>
            </div>
          </div>
        </div>

        <h3 className="form-label text-lg mb-4">日別の詳細履歴</h3>
        
        {Object.keys(groupedRecords).length === 0 ? (
          <p className="text-muted text-center py-8">今月の打刻データはありません</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.entries(groupedRecords).map(([date, dailyRecords]) => {
              const stats = calculateDailyStats(dailyRecords);
              
              return (
                <div key={date} className="animate-slide-up" style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '6px', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div className="flex flex-col gap-2">
                    {/* 上段: 日付 */}
                    <div className="pb-2 border-b">
                      <span className="font-bold text-lg text-primary">{date} ({new Date(date).toLocaleDateString('ja-JP', { weekday: 'short' })})</span>
                    </div>
                    
                    {/* 下段: 詳細な集計情報 */}
                    {stats.elapsedMinutes > 0 || stats.clockIn ? (
                      <div className="flex flex-wrap gap-4 text-sm font-medium items-center text-muted mt-2">
                        <span className="text-foreground font-bold" style={{ fontSize: '1.05em' }}>
                          出勤: {stats.clockIn ? (() => {
                            const d = new Date(stats.clockIn);
                            const h = d.getHours() < 5 ? d.getHours() + 24 : d.getHours();
                            return `${h}:${d.getMinutes().toString().padStart(2, '0')}`;
                          })() : '--:--'}
                        </span>
                        <span className="text-foreground font-bold" style={{ fontSize: '1.05em' }}>
                          退勤: {stats.clockOut ? (() => {
                            const d = new Date(stats.clockOut);
                            const h = d.getHours() < 5 ? d.getHours() + 24 : d.getHours();
                            return `${h}:${d.getMinutes().toString().padStart(2, '0')}`;
                          })() : '--:--'}
                        </span>
                        
                        {stats.elapsedMinutes > 0 && (
                          <>
                            <span className="text-primary font-bold px-2 py-1 rounded ml-2" style={{ backgroundColor: '#e8f0fe' }}>実働 {formatTime(stats.workingMinutes)}</span>
                            <span>所定 {formatTime(stats.regularMinutes)}</span>
                            <span style={{ color: stats.overtimeMinutes > 0 ? 'var(--danger)' : 'inherit' }}>残業 {formatTime(stats.overtimeMinutes)}</span>
                            <span>深夜残業 {formatTime(stats.nightMinutes)}</span>
                            <span>休憩 {formatTime(stats.breakMinutes)}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400 mt-2">打刻データが不十分です</div>
                    )}
                    
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
