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

  // 締め日ロジック (前月26日 〜 当月25日) - JST強制
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // JST計算用の仮想UTCオブジェクト
  if (jstNow.getUTCHours() < 5) jstNow.setUTCDate(jstNow.getUTCDate() - 1);

  const currentYear = jstNow.getUTCFullYear();
  const currentMonth = jstNow.getUTCMonth(); // 0-indexed
  const currentDate = jstNow.getUTCDate();

  let periodStart: Date;
  let periodEnd: Date;

  if (currentDate >= 26) {
    periodStart = new Date(Date.UTC(currentYear, currentMonth, 26, 5 - 9, 0, 0, 0));
    periodEnd = new Date(Date.UTC(currentYear, currentMonth + 1, 26, 4 - 9, 59, 59, 999));
  } else {
    periodStart = new Date(Date.UTC(currentYear, currentMonth - 1, 26, 5 - 9, 0, 0, 0));
    periodEnd = new Date(Date.UTC(currentYear, currentMonth, 26, 4 - 9, 59, 59, 999));
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

  // Business Day (5:00 ~ 28:59) でグループ化 (JST強制)
  const groupedRecords: Record<string, any[]> = {};
  records.forEach(r => {
    // タイムスタンプに9時間足して、UTCのメソッドでJSTとして扱う
    const d = new Date(r.timestamp.getTime() + 9 * 60 * 60 * 1000);
    if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
    
    // YYYY/MM/DD フォーマット
    const yyyy = d.getUTCFullYear();
    const mm = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    const dateStr = `${yyyy}/${mm}/${dd}`;
    
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
        <div className="mb-6 flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-white border rounded shadow-sm">
          <div className="flex items-center gap-2 px-2 md:border-r border-gray-100 md:pr-6 pb-2 md:pb-0 border-b md:border-b-0 w-full md:w-auto justify-center md:justify-start">
            <span className="text-sm font-bold text-muted">勤務累計</span>
            <span className="text-xs text-muted">({periodStart.getMonth() + 1}/26〜{periodEnd.getMonth() + 1}/25)</span>
          </div>
          <div className="flex flex-row flex-wrap justify-around items-center gap-4 w-full text-center">
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted mb-1">総実働</span>
              <span className="font-bold text-xl text-primary">{formatTime(totalWorking)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted mb-1">所定</span>
              <span className="font-bold text-xl">{formatTime(totalRegular)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted mb-1">残業</span>
              <span className="font-bold text-xl" style={{ color: totalOvertime > 0 ? 'var(--danger)' : 'inherit' }}>{formatTime(totalOvertime)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted mb-1">深夜</span>
              <span className="font-bold text-xl">{formatTime(totalNight)}</span>
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
                            const d = new Date(stats.clockIn.getTime() + 9 * 60 * 60 * 1000);
                            const h = d.getUTCHours() < 5 ? d.getUTCHours() + 24 : d.getUTCHours();
                            return `${h}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
                          })() : '--:--'}
                        </span>
                        <span className="text-foreground font-bold" style={{ fontSize: '1.05em' }}>
                          退勤: {stats.clockOut ? (() => {
                            const d = new Date(stats.clockOut.getTime() + 9 * 60 * 60 * 1000);
                            const h = d.getUTCHours() < 5 ? d.getUTCHours() + 24 : d.getUTCHours();
                            return `${h}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
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
