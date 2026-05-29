import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calculateDailyStats, formatTime } from "@/lib/attendanceCalc";
import AdminClient from "./admin-client";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect("/login");
  }

  // 管理者権限チェック
  if ((session.user as any).role !== "ADMIN") {
    return (
      <div className="container animate-fade-in">
        <div className="card" style={{ textAlign: 'center', padding: '48px 28px' }}>
          <h3 className="form-label text-lg mb-4">⚠️ 管理者権限が必要です</h3>
          <p className="text-muted">
            このページにアクセスするには管理者権限が必要です。<br />
            管理者にお問い合わせください。
          </p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const bizToday = new Date(now);
  if (bizToday.getHours() < 5) bizToday.setDate(bizToday.getDate() - 1);
  
  const startOfDay = new Date(bizToday);
  startOfDay.setHours(5, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  endOfDay.setHours(4, 59, 59, 999);

  // 本日の勤務データ（勤務状況タブ用）
  const usersWithAttendance = await prisma.user.findMany({
    include: {
      attendances: {
        where: { timestamp: { gte: startOfDay, lte: endOfDay } },
        orderBy: { timestamp: 'asc' }
      }
    }
  });

  const todayData = usersWithAttendance.map((user: any) => {
    const clockIn = user.attendances.find((a: any) => a.type === 'CLOCK_IN');
    const clockOut = user.attendances.find((a: any) => a.type === 'CLOCK_OUT');
    let status = '未出勤';
    if (clockIn && !clockOut) status = '勤務中';
    if (clockIn && clockOut) status = '退勤済';

    const stats = calculateDailyStats(user.attendances);

    return {
      id: user.id,
      name: user.name || '未設定',
      clockIn: clockIn ? new Date(clockIn.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : null,
      clockOut: clockOut ? new Date(clockOut.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : null,
      workingMinutes: stats.workingMinutes,
      overtimeMinutes: stats.overtimeMinutes,
      elapsedMinutes: stats.elapsedMinutes,
      status,
    };
  });

  // 全ユーザー一覧（ユーザー管理タブ用）
  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
    orderBy: { name: 'asc' }
  });

  // roleをstring型に変換（シリアライズ対応）
  const serializedUsers = allUsers.map((u: any) => ({
    id: u.id,
    name: u.name || '未設定',
    email: u.email || '',
    role: String(u.role || 'USER'),
  }));

  return (
    <div className="container animate-fade-in">
      <AdminClient todayData={todayData} allUsers={serializedUsers} />
    </div>
  );
}
