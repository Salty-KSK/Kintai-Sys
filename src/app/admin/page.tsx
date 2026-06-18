import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
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

  // ===== 日時計算 =====
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentYear = jstNow.getUTCFullYear();
  const currentMonth = jstNow.getUTCMonth() + 1;

  const dates = generateDateRange(currentYear, currentMonth);
  const periodStart = dates[0];
  const periodEnd = new Date(dates[dates.length - 1]);
  periodEnd.setHours(23, 59, 59, 999);

  const startUTC = new Date(Date.UTC(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate(), -9, 0, 0));
  const endUTC = new Date(Date.UTC(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate() + 1, 4 - 9, 59, 59, 999));

  const yearStartUTC = new Date(Date.UTC(currentYear - 1, 11, 26, -9, 0, 0));
  const yearEndUTC = startUTC;

  // ===== ① 全DBクエリをPromise.allで並列実行 (8逐次→6並列) =====
  const [
    usersWithAttendance,
    allRecords,
    holidays,
    yearRecordsCached,
    yearHolidaysCached,
    allHolidays,
  ] = await Promise.all([
    // ユーザー + 当日打刻（ユーザー管理 & 本日の勤務状況 兼用）
    prisma.user.findMany({
      where: userFilter,
      include: {
        attendances: {
          where: { timestamp: { gte: startOfDay, lte: endOfDay } },
          orderBy: { timestamp: 'asc' }
        }
      },
      orderBy: { employeeId: 'asc' },
    }),
    // 当月の全打刻データ
    prisma.attendanceRecord.findMany({
      where: {
        user: userFilter,
        timestamp: { gte: startUTC, lte: endUTC },
      },
      orderBy: { timestamp: 'asc' },
    }),
    // 当月の祝日
    prisma.holiday.findMany({
      where: { date: { gte: startUTC, lte: endUTC } },
    }),
    // 年初〜前月の打刻データ（キャッシュ: 過去データなので頻繁に変わらない）
    unstable_cache(
      async () => prisma.attendanceRecord.findMany({
        where: {
          user: userFilter,
          timestamp: { gte: yearStartUTC, lt: yearEndUTC },
        },
        orderBy: { timestamp: 'asc' },
      }),
      ['admin-year-records', currentDept || 'all', String(currentYear), String(currentMonth)],
      { revalidate: 300 }
    )(),
    // 年初〜前月の祝日（キャッシュ）
    unstable_cache(
      async () => prisma.holiday.findMany({
        where: { date: { gte: yearStartUTC, lt: yearEndUTC } },
      }),
      ['admin-year-holidays', String(currentYear), String(currentMonth)],
      { revalidate: 300 }
    )(),
    // 全祝日（祝日管理タブ用）
    prisma.holiday.findMany({ orderBy: { date: 'asc' } }),
  ]);

  const yearRecords = yearRecordsCached;
  const yearHolidays = yearHolidaysCached;

  // ===== ② usersWithAttendanceから各種データを導出 =====

  // 本日の勤務データ
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
      employeeId: user.employeeId || '',
      department: user.department || '',
      clockIn: clockIn ? new Date(clockIn.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : null,
      clockOut: clockOut ? new Date(clockOut.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : null,
      workingMinutes: stats.workingMinutes,
      overtimeMinutes: stats.overtimeMinutes,
      elapsedMinutes: stats.elapsedMinutes,
      status,
    };
  });

  // ユーザー一覧（同じデータから導出 — 追加クエリ不要）
  const serializedUsers = usersWithAttendance.map((u: any) => ({
    id: u.id,
    name: u.name || '未設定',
    email: u.email || '',
    role: String(u.role || 'USER'),
    department: u.department || '',
    position: u.position || '',
    employeeId: u.employeeId || '',
  }));

  // ===== ③ レコードをユーザーIDでMapに事前分割 (O(N²) → O(N)) =====
  const allRecordsByUser = new Map<string, typeof allRecords>();
  for (const r of allRecords) {
    const arr = allRecordsByUser.get(r.userId) || [];
    arr.push(r);
    allRecordsByUser.set(r.userId, arr);
  }

  const yearRecordsByUser = new Map<string, typeof yearRecords>();
  for (const r of yearRecords) {
    const arr = yearRecordsByUser.get(r.userId) || [];
    arr.push(r);
    yearRecordsByUser.set(r.userId, arr);
  }

  const holidayDates = holidays.map(h => h.date);
  const yearHolidayDates = yearHolidays.map(h => h.date);

  // ===== ④ 月別残業集計 =====
  type MonthBreakdown = { month: number; periodStr: string; overtimeMin: number; holidayMin: number; totalMin: number };
  const yearlyBreakdownMap: Record<string, MonthBreakdown[]> = {};

  for (const user of usersWithAttendance) {
    const userAllRecords = allRecordsByUser.get(user.id) || [];
    const userYearRecords = yearRecordsByUser.get(user.id) || [];
    const breakdowns: MonthBreakdown[] = [];

    for (let m = 1; m <= currentMonth; m++) {
      const mDates = generateDateRange(currentYear, m);
      const mPeriodStr = `${mDates[0].getMonth()+1}/${mDates[0].getDate()}～${mDates[mDates.length-1].getMonth()+1}/${mDates[mDates.length-1].getDate()}`;
      let overtimeMin = 0;
      let holidayMin = 0;

      const sourceRecords = m < currentMonth ? userYearRecords : userAllRecords;
      const sourceHolidays = m < currentMonth ? yearHolidayDates : holidayDates;

      for (const date of mDates) {
        const y = date.getFullYear(), mo = date.getMonth(), dd = date.getDate();
        const dayStart = new Date(Date.UTC(y, mo, dd, 5 - 9, 0, 0, 0));
        const dayEnd = new Date(Date.UTC(y, mo, dd + 1, 4 - 9, 59, 59, 999));

        const dayRecords = sourceRecords.filter(r =>
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

  // 当月の日別サマリー
  const employeesData = usersWithAttendance.map((user: any) => {
    const userRecords = allRecordsByUser.get(user.id) || [];
    const dailySummaries: DailySummary[] = dates.map(date => {
      const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
      const dayStart = new Date(Date.UTC(y, m, d, 5 - 9, 0, 0, 0));
      const dayEnd = new Date(Date.UTC(y, m, d + 1, 4 - 9, 59, 59, 999));

      const dayRecords = userRecords.filter(r =>
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

  // 祝日一覧
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
