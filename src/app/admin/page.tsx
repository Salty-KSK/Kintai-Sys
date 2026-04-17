import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Users, LayoutDashboard, Clock } from "lucide-react";
import { calculateDailyStats, formatTime } from "@/lib/attendanceCalc";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect("/login");
  }
  
  const now = new Date();
  const bizToday = new Date(now);
  if (bizToday.getHours() < 5) bizToday.setDate(bizToday.getDate() - 1);
  
  const startOfDay = new Date(bizToday);
  startOfDay.setHours(5, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  endOfDay.setHours(4, 59, 59, 999);

  const users = await prisma.user.findMany({
    include: {
      attendances: {
        where: { timestamp: { gte: startOfDay, lte: endOfDay } },
        orderBy: { timestamp: 'asc' }
      }
    }
  });

  return (
    <div className="container" style={{ maxWidth: '1000px' }}>
      <div className="card animate-fade-in">
        <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <div className="flex items-center gap-3">
            <Clock className="text-primary" size={24} />
            <h1 className="text-xl">勤怠管理システム (管理者全社状況)</h1>
          </div>
          <div className="text-sm text-muted">
            {session.user.name}さん
          </div>
        </div>

        <div className="header-tabs">
          <Link href="/admin" className="header-tab active flex items-center gap-2">
            <Users size={18} /> 本日の全体状況
          </Link>
          <Link href="/" className="header-tab flex items-center gap-2">
            <LayoutDashboard size={18} /> 個人打刻画面へ戻る
          </Link>
        </div>

        <h3 className="form-label text-lg mb-4">本日の出退勤と勤務時間</h3>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th className="py-3 px-2">社員名</th>
              <th className="py-3 px-2">出勤時刻</th>
              <th className="py-3 px-2">退勤時刻</th>
              <th className="py-3 px-2">実働</th>
              <th className="py-3 px-2">残業</th>
              <th className="py-3 px-2">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user: any) => {
              const clockIn = user.attendances.find((a: any) => a.type === 'CLOCK_IN');
              const clockOut = user.attendances.find((a: any) => a.type === 'CLOCK_OUT');
              let status = '未出勤';
              if (clockIn && !clockOut) status = '勤務中';
              if (clockIn && clockOut) status = '退勤済';

              const stats = calculateDailyStats(user.attendances);

              return (
                <tr key={user.id} className="hover:bg-gray-50" style={{ borderBottom: '1px solid #eee' }}>
                  <td className="py-4 px-2 font-bold">{user.name || '未設定'}</td>
                  <td className="py-4 px-2 text-lg">
                    {clockIn ? new Date(clockIn.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="py-4 px-2 text-lg">
                    {clockOut ? new Date(clockOut.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="py-4 px-2 font-bold text-lg">
                    {stats.elapsedMinutes > 0 ? formatTime(stats.workingMinutes) : '-'}
                  </td>
                  <td className="py-4 px-2 text-lg" style={{ color: stats.overtimeMinutes > 0 ? 'var(--danger)' : 'inherit', fontWeight: stats.overtimeMinutes > 0 ? 'bold' : 'normal' }}>
                    {stats.elapsedMinutes > 0 ? formatTime(stats.overtimeMinutes) : '-'}
                  </td>
                  <td className="py-4 px-2 font-bold" style={{ color: status === '勤務中' ? '#34A853' : 'inherit' }}>
                    {status}
                  </td>
                </tr>
              );
            })}
            
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted">ユーザーデータがまだありません</td>
              </tr>
            )}
          </tbody>
        </table>

      </div>
    </div>
  );
}
