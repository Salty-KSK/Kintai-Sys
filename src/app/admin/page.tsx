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
    <div className="container animate-fade-in">
      <h3 className="form-label text-lg mb-4">本日の出退勤と勤務時間</h3>
      
      <table className="data-table" style={{ marginTop: '1rem' }}>
        <thead>
          <tr>
            <th>社員名</th>
            <th>出勤時刻</th>
            <th>退勤時刻</th>
            <th>実働</th>
            <th>残業</th>
            <th>ステータス</th>
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
              <tr key={user.id}>
                <td style={{ fontWeight: 'bold' }}>{user.name || '未設定'}</td>
                <td>
                  {clockIn ? new Date(clockIn.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '-'}
                </td>
                <td>
                  {clockOut ? new Date(clockOut.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '-'}
                </td>
                <td style={{ fontWeight: 'bold' }}>
                  {stats.elapsedMinutes > 0 ? formatTime(stats.workingMinutes) : '-'}
                </td>
                <td style={{ color: stats.overtimeMinutes > 0 ? 'var(--danger)' : 'inherit', fontWeight: stats.overtimeMinutes > 0 ? 'bold' : 'normal' }}>
                  {stats.elapsedMinutes > 0 ? formatTime(stats.overtimeMinutes) : '-'}
                </td>
                <td style={{ color: status === '勤務中' ? '#34A853' : 'inherit', fontWeight: 'bold' }}>
                  {status}
                </td>
              </tr>
            );
          })}
          
          {users.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: '24px 0', textAlign: 'center', color: 'var(--google-text-sub)' }}>ユーザーデータがまだありません</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
