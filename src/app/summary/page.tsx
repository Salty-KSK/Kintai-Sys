import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SummaryClient from "./summary-client";
import {
  generateDateRange,
  calculateDailySummary,
  calculateMonthlySummary,
  type DailySummary
} from "@/lib/summaryCalc";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; year?: string; month?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) redirect("/login");

  const params = await searchParams;
  const currentRole = (session.user as any).role;
  const currentUserId = (session.user as any).id;
  const currentDept = (session.user as any).department;
  const canViewOthers = currentRole === "ADMIN" || currentRole === "MANAGER";

  // ユーザー取得: ADMIN=全員、MANAGER=同一部署、USER=自分のみ
  let allUsers;
  if (currentRole === "ADMIN") {
    allUsers = await prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  } else if (currentRole === "MANAGER" && currentDept) {
    allUsers = await prisma.user.findMany({
      where: { department: currentDept },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } else {
    allUsers = [{ id: currentUserId, name: (session.user as any).name || "自分" }];
  }

  // 選択中のユーザー
  const selectedUserId = canViewOthers && params.user ? params.user : currentUserId;

  // 選択中の年月（デフォルト: 今月）
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const defaultYear = jstNow.getUTCFullYear();
  const defaultMonth = jstNow.getUTCMonth() + 1;
  const year = params.year ? parseInt(params.year) : defaultYear;
  const month = params.month ? parseInt(params.month) : defaultMonth;

  // ビジネスデー期間（前月26日〜当月25日）
  const dates = generateDateRange(year, month);
  const startDate = dates[0];
  const endDate = new Date(dates[dates.length - 1]);
  endDate.setHours(23, 59, 59, 999);

  // 打刻データ取得
  const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), -9, 0, 0));
  const endUTC = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 14, 59, 59));

  const records = await prisma.attendanceRecord.findMany({
    where: {
      userId: selectedUserId,
      timestamp: { gte: startUTC, lte: endUTC }
    },
    orderBy: { timestamp: "asc" }
  });

  // 祝日取得
  const holidays = await prisma.holiday.findMany({
    where: {
      date: { gte: startUTC, lte: endUTC }
    }
  });
  const holidayDates = holidays.map(h => h.date);

  // 日別集計
  const dailySummaries: DailySummary[] = dates.map(date => {
    // その日のJSTビジネスデー境界
    const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    const dayStart = new Date(Date.UTC(y, m, d, 5 - 9, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(y, m, d + 1, 4 - 9, 59, 59, 999));

    const dayRecords = records.filter(r => {
      const t = new Date(r.timestamp);
      return t >= dayStart && t <= dayEnd;
    });

    return calculateDailySummary(date, dayRecords, holidayDates);
  });

  // 月間サマリー
  const monthlySummary = calculateMonthlySummary(dailySummaries);

  // ユーザー情報
  const selectedUser = await prisma.user.findUnique({
    where: { id: selectedUserId },
    select: { name: true, employeeId: true, department: true }
  });

  // 期間文字列
  const periodStr = `${dates[0].getFullYear()}/${(dates[0].getMonth()+1).toString().padStart(2,'0')}/${dates[0].getDate().toString().padStart(2,'0')} 〜 ${dates[dates.length-1].getFullYear()}/${(dates[dates.length-1].getMonth()+1).toString().padStart(2,'0')}/${dates[dates.length-1].getDate().toString().padStart(2,'0')}`;

  // シリアライズ
  const serializedData = {
    dailySummaries,
    monthlySummary,
    selectedUser: {
      id: selectedUserId,
      name: selectedUser?.name || "未設定",
      employeeId: selectedUser?.employeeId || "",
      department: selectedUser?.department || ""
    },
    allUsers: allUsers.map(u => ({ id: u.id, name: u.name || "未設定" })),
    year,
    month,
    isAdmin: canViewOthers,
    periodStr,
    records: Object.fromEntries(
      dates.map(d => {
        const dateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
        const startOfDay = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 5 - 9, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 1, 4 - 9, 59, 59, 999));
        const dayRecords = records.filter(r => r.timestamp >= startOfDay && r.timestamp <= endOfDay);
        return [dateStr, dayRecords.map(r => ({
          id: r.id,
          type: r.type,
          timestamp: r.timestamp.toISOString(),
          breakMinutes: (r as any).breakMinutes ?? null,
          note: (r as any).note ?? null
        }))];
      })
    ),
    canEdit: (session.user as any).id === selectedUserId || canViewOthers,
    viewingUserId: selectedUserId,
    sessionUserId: (session.user as any).id,
  };

  return <SummaryClient {...serializedData} />;
}
