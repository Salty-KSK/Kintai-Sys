import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calculateDailyStats, formatTime } from "@/lib/attendanceCalc";
import {
  calculateDailySummary,
  calculateMonthlySummary,
  generateDateRange,
  getBusinessPeriod,
  type DailySummary,
} from "@/lib/summaryCalc";
import AdminClient from "./admin-client";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect("/login");
  }

  const currentRole = (session.user as any).role;
  const currentDept = (session.user as any).department;
  const currentUserId = (session.user as any).id as string;

  // 管理者権限チェック（MANAGER or ADMIN）
  if (currentRole !== "ADMIN" && currentRole !== "MANAGER") {
    return (
      <div className="container animate-fade-in">
        <div className="card" style={{ textAlign: 'center', padding: '48px 28px' }}>
          <h3 className="form-label text-lg mb-4">⚠️ 管理者権限が必要です</h3>
          <p className="text-muted">
            このページにアクセスするには管理者権限が必要です。<br />
            管理責任者にお問い合わせください。
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

  // MANAGERは同一部署のみ、ADMINは全員
  const userFilter = (currentRole === "MANAGER" && currentDept)
    ? { department: currentDept }
    : {};

  // 本日の勤務データ（勤務状況タブ用）
  const usersWithAttendance = await prisma.user.findMany({
    where: userFilter,
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
      department: user.department || '',
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
    where: userFilter,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      position: true,
      employeeId: true,
    },
    orderBy: { employeeId: 'asc' }
  });

  // roleをstring型に変換（シリアライズ対応）
  const serializedUsers = allUsers.map((u: any) => ({
    id: u.id,
    name: u.name || '未設定',
    email: u.email || '',
    role: String(u.role || 'USER'),
    department: u.department || '',
    position: u.position || '',
    employeeId: u.employeeId || '',
  }));

  // ===== 残業ヒートマップ用データ =====
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentYear = jstNow.getUTCFullYear();
  const currentMonth = jstNow.getUTCMonth() + 1;

  // 当月の日付範囲（前月26日～当月25日）
  const dates = generateDateRange(currentYear, currentMonth);
  const periodStart = dates[0];
  const periodEnd = new Date(dates[dates.length - 1]);
  periodEnd.setHours(23, 59, 59, 999);

  const startUTC = new Date(Date.UTC(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate(), -9, 0, 0));
  const endUTC = new Date(Date.UTC(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate() + 1, 4 - 9, 59, 59, 999));

  // 対象ユーザー一覧を取得
  const overtimeUsers = await prisma.user.findMany({
    where: userFilter,
    select: { id: true, name: true, department: true },
    orderBy: { employeeId: 'asc' },
  });

  // 当月の全打刻データを一括取得
  const allRecords = await prisma.attendanceRecord.findMany({
    where: {
      userId: { in: overtimeUsers.map(u => u.id) },
      timestamp: { gte: startUTC, lte: endUTC },
    },
    orderBy: { timestamp: 'asc' },
  });

  // 祝日取得
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: startUTC, lte: endUTC } },
  });
  const holidayDates = holidays.map(h => h.date);

  // 年累計用: 1月〜前月分の残業を簡易集計
  // 各月のビジネスピリオド内の打刻を取得して残業を集計
  const yearStartUTC = new Date(Date.UTC(currentYear - 1, 11, 26, -9, 0, 0)); // 1月期間 = 前年12/26開始
  const yearEndUTC = startUTC; // 当月開始日まで

  const yearRecords = await prisma.attendanceRecord.findMany({
    where: {
      userId: { in: overtimeUsers.map(u => u.id) },
      timestamp: { gte: yearStartUTC, lt: yearEndUTC },
    },
    orderBy: { timestamp: 'asc' },
  });

  const yearHolidays = await prisma.holiday.findMany({
    where: { date: { gte: yearStartUTC, lt: yearEndUTC } },
  });
  const yearHolidayDates = yearHolidays.map(h => h.date);

  // ユーザーごとの月別内訳を計算（1月～当月）
  type MonthBreakdown = { month: number; periodStr: string; overtimeMin: number; holidayMin: number; totalMin: number };
  const yearlyBreakdownMap: Record<string, MonthBreakdown[]> = {};

  for (const user of overtimeUsers) {
    const breakdowns: MonthBreakdown[] = [];
    for (let m = 1; m <= currentMonth; m++) {
      const mDates = generateDateRange(currentYear, m);
      const mPeriodStr = `${mDates[0].getMonth()+1}/${mDates[0].getDate()}～${mDates[mDates.length-1].getMonth()+1}/${mDates[mDates.length-1].getDate()}`;
      let overtimeMin = 0;
      let holidayMin = 0;

      // 当月以外はyearRecords、当月はallRecordsを使う
      const sourceRecords = m < currentMonth ? yearRecords : allRecords;
      const sourceHolidays = m < currentMonth ? yearHolidayDates : holidayDates;

      for (const date of mDates) {
        const y = date.getFullYear(), mo = date.getMonth(), dd = date.getDate();
        const dayStart = new Date(Date.UTC(y, mo, dd, 5 - 9, 0, 0, 0));
        const dayEnd = new Date(Date.UTC(y, mo, dd + 1, 4 - 9, 59, 59, 999));

        const dayRecords = sourceRecords.filter(r =>
          r.userId === user.id &&
          new Date(r.timestamp) >= dayStart &&
          new Date(r.timestamp) <= dayEnd
        );

        if (dayRecords.length > 0) {
          const ds = calculateDailySummary(date, dayRecords, sourceHolidays);
          overtimeMin += ds.overtimeMinutes + ds.nightOvertimeMin;
          holidayMin += ds.holidaySatMin + ds.holidaySatNightMin + ds.holidaySunMin + ds.holidaySunNightMin;
        }
      }

      breakdowns.push({
        month: m,
        periodStr: mPeriodStr,
        overtimeMin,
        holidayMin,
        totalMin: overtimeMin + holidayMin,
      });
    }
    yearlyBreakdownMap[user.id] = breakdowns;
  }

  // 当月の日別サマリーを各ユーザーごとに計算
  const employeesData = overtimeUsers.map(user => {
    const dailySummaries: DailySummary[] = dates.map(date => {
      const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
      const dayStart = new Date(Date.UTC(y, m, d, 5 - 9, 0, 0, 0));
      const dayEnd = new Date(Date.UTC(y, m, d + 1, 4 - 9, 59, 59, 999));

      const dayRecords = allRecords.filter(r =>
        r.userId === user.id &&
        new Date(r.timestamp) >= dayStart &&
        new Date(r.timestamp) <= dayEnd
      );

      return calculateDailySummary(date, dayRecords, holidayDates);
    });

    const monthlySummary = calculateMonthlySummary(dailySummaries);
    const monthlyOvertime = monthlySummary.weekdayOvertime + monthlySummary.weekdayNightOvertime;
    const breakdowns = yearlyBreakdownMap[user.id] || [];
    const yearlyOvertime = breakdowns.reduce((sum, b) => sum + b.totalMin, 0);

    return {
      id: user.id,
      name: user.name || '未設定',
      department: user.department || null,
      dailySummaries,
      monthlyOvertime,
      yearlyOvertime,
      monthlyBreakdowns: breakdowns,
    };
  });

  const periodStr = `${dates[0].getFullYear()}/${(dates[0].getMonth()+1).toString().padStart(2,'0')}/${dates[0].getDate().toString().padStart(2,'0')} 〜 ${dates[dates.length-1].getFullYear()}/${(dates[dates.length-1].getMonth()+1).toString().padStart(2,'0')}/${dates[dates.length-1].getDate().toString().padStart(2,'0')}`;

  const overtimeData = {
    year: currentYear,
    month: currentMonth,
    periodStr,
    employees: employeesData,
  };

  // 祝日一覧取得（祝日管理タブ用）
  const allHolidays = await prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  const serializedHolidays = allHolidays.map(h => ({
    id: h.id,
    date: h.date.toISOString(),
    name: h.name,
  }));

  return (
    <div className="container animate-fade-in">
      <AdminClient
        todayData={todayData}
        allUsers={serializedUsers}
        currentRole={currentRole}
        currentUserId={currentUserId}
        currentDepartment={currentDept || ''}
        overtimeData={overtimeData}
        holidays={serializedHolidays}
      />
    </div>
  );
}
