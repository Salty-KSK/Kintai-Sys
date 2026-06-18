import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SummaryClient from "./summary-client";
import {
  generateDateRange,
  calculateDailySummary,
  calculateMonthlySummary,
  type DailySummary,
  type DayType
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
    allUsers = await prisma.user.findMany({ select: { id: true, name: true, employeeId: true, department: true }, orderBy: { employeeId: "asc" } });
  } else if (currentRole === "MANAGER" && currentDept) {
    allUsers = await prisma.user.findMany({
      where: { department: currentDept },
      select: { id: true, name: true, employeeId: true, department: true },
      orderBy: { employeeId: "asc" },
    });
  } else {
    allUsers = [{ id: currentUserId, name: (session.user as any).name || "自分", employeeId: "", department: "" }];
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

  const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), -9, 0, 0));
  const endUTC = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1, 12 - 9, 59, 59, 999));

  // 打刻データ、祝日、オーバーライドを並列取得
  let [records, holidays, dayTypeOverrides] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        userId: selectedUserId,
        timestamp: { gte: startUTC, lte: endUTC }
      },
      orderBy: { timestamp: "asc" }
    }),
    prisma.holiday.findMany({
      where: { date: { gte: startUTC, lte: endUTC } }
    }),
    prisma.dayTypeOverride.findMany({
      where: {
        date: { gte: startUTC, lte: endUTC },
        OR: [
          { userId: selectedUserId },
          { userId: null }
        ]
      }
    }),
  ]);
  const holidayDates = holidays.map(h => h.date);

  // 孤立した振替系DayTypeOverrideを自動クリーンアップ
  const orphanedOverrideIds: string[] = [];
  for (const ov of dayTypeOverrides) {
    if (ov.userId && ov.reason && ov.reason.includes('振替休日')) {
      // この振替出勤日オーバーライドに対応するSTATUS_FURIKYUレコードが存在するか確認
      const hasFurikyu = records.some(r =>
        r.type === 'STATUS_FURIKYU' && r.note && r.note.includes('振替出勤日')
      );
      if (!hasFurikyu) {
        orphanedOverrideIds.push(ov.id);
      }
    }
  }
  if (orphanedOverrideIds.length > 0) {
    await prisma.dayTypeOverride.deleteMany({ where: { id: { in: orphanedOverrideIds } } });
    dayTypeOverrides = dayTypeOverrides.filter(o => !orphanedOverrideIds.includes(o.id));
  }

  // 日別集計（レコードの重複割り当て防止用セット）
  const lastDate = dates[dates.length - 1];
  const assignedIds = new Set<string>();
  const dailySummaries: DailySummary[] = dates.map(date => {
    const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    const dayStart = new Date(Date.UTC(y, m, d, 5 - 9, 0, 0, 0));          // 05:00 JST
    const strictEnd = new Date(Date.UTC(y, m, d + 1, 4 - 9, 59, 59, 999)); // 翌04:59 JST
    const extendEnd = new Date(Date.UTC(y, m, d + 1, 12 - 9, 59, 59, 999)); // 翌12:59 JST

    const dayRecords = records.filter(r => {
      if (assignedIds.has(r.id)) return false;
      const t = new Date(r.timestamp);
      if (t < dayStart) return false;
      // 厳密な境界内(〜翌4:59): 全レコードを含む
      if (t <= strictEnd) return true;
      // 拡張範囲(翌5:00〜12:59): CLOCK_OUTのみ含む（深夜退勤が消えないように）
      if (t <= extendEnd && r.type === 'CLOCK_OUT') return true;
      return false;
    });
    dayRecords.forEach(r => assignedIds.add(r.id));

    // その日のオーバーライドを検索（ユーザー固有 > グローバルの優先順）
    const dayOverrides = dayTypeOverrides.filter(o => {
      const od = new Date(o.date);
      return od.getFullYear() === date.getFullYear() &&
             od.getMonth() === date.getMonth() &&
             od.getDate() === date.getDate();
    });
    const override = dayOverrides.find(o => o.userId === selectedUserId) || dayOverrides.find(o => !o.userId);

    // 翌暦日のdayTypeを計算（0時以降の深夜勤務を翌日の種別で分類するため）
    const nextCalDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const nextDow = nextCalDate.getDay();
    let nextDayType: DayType = "weekday";
    if (nextDow === 0) nextDayType = "sunday";
    else if (nextDow === 6) nextDayType = "saturday";
    // 翌日の祝日チェック
    const nextIsHoliday = holidayDates.some(h => {
      const hd = new Date(h);
      return hd.getFullYear() === nextCalDate.getFullYear() &&
             hd.getMonth() === nextCalDate.getMonth() &&
             hd.getDate() === nextCalDate.getDate();
    });
    if (nextIsHoliday && nextDayType === "weekday") nextDayType = "holiday";
    // 翌日のオーバーライド
    const nextDateStr = `${nextCalDate.getFullYear()}/${(nextCalDate.getMonth()+1).toString().padStart(2,'0')}/${nextCalDate.getDate().toString().padStart(2,'0')}`;
    const nextOverrides = dayTypeOverrides.filter(o => {
      const od = new Date(o.date);
      return od.getFullYear() === nextCalDate.getFullYear() &&
             od.getMonth() === nextCalDate.getMonth() &&
             od.getDate() === nextCalDate.getDate();
    });
    const nextOverride = nextOverrides.find(o => o.userId === selectedUserId) || nextOverrides.find(o => !o.userId);
    if (nextOverride) nextDayType = nextOverride.dayType as DayType;

    return calculateDailySummary(date, dayRecords, holidayDates, override?.dayType as any || null, nextDayType);
  });

  // 月間サマリー
  const monthlySummary = calculateMonthlySummary(dailySummaries);

  // ユーザー情報（allUsersから導出 — 追加クエリ不要）
  const selectedUser = allUsers.find(u => u.id === selectedUserId) || { name: '未設定', employeeId: '', department: '' };

  // 期間文字列
  const periodStr = `${dates[0].getFullYear()}/${(dates[0].getMonth()+1).toString().padStart(2,'0')}/${dates[0].getDate().toString().padStart(2,'0')} 〜 ${dates[dates.length-1].getFullYear()}/${(dates[dates.length-1].getMonth()+1).toString().padStart(2,'0')}/${dates[dates.length-1].getDate().toString().padStart(2,'0')}`;

  // シリアライズ
  const serializedData = {
    dailySummaries,
    monthlySummary,
    selectedUser: {
      id: selectedUserId,
      name: selectedUser?.name || "未設定",
      employeeId: (selectedUser as any)?.employeeId || "",
      department: (selectedUser as any)?.department || ""
    },
    allUsers: allUsers.map(u => ({ id: u.id, name: u.name || "未設定" })),
    year,
    month,
    isAdmin: canViewOthers,
    periodStr,
    records: (() => {
      const assignedRecIds = new Set<string>();
      return Object.fromEntries(
        dates.map(d => {
          const dateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
          const startOfDay = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 5 - 9, 0, 0, 0));
          const strictEnd = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 1, 4 - 9, 59, 59, 999));
          const extendEnd = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12 - 9, 59, 59, 999));
          const dayRecords = records.filter(r => {
            if (assignedRecIds.has(r.id)) return false;
            if (r.timestamp < startOfDay) return false;
            if (r.timestamp <= strictEnd) return true;
            if (r.timestamp <= extendEnd && r.type === 'CLOCK_OUT') return true;
            return false;
          });
          dayRecords.forEach(r => assignedRecIds.add(r.id));
          return [dateStr, dayRecords.map(r => ({
            id: r.id,
            type: r.type,
            timestamp: r.timestamp.toISOString(),
            breakMinutes: (r as any).breakMinutes ?? null,
            note: (r as any).note ?? null
          }))];
        })
      );
    })(),
    dayTypeOverrides: (() => {
      const map: Record<string, { dayType: string; reason: string }> = {};
      // グローバル(userId=null)を先に、ユーザー固有を後に処理（後勝ちで上書き）
      const sorted = [...dayTypeOverrides].sort((a, b) => (a.userId ? 1 : 0) - (b.userId ? 1 : 0));
      for (const o of sorted) {
        const key = `${new Date(o.date).getFullYear()}/${(new Date(o.date).getMonth()+1).toString().padStart(2,'0')}/${new Date(o.date).getDate().toString().padStart(2,'0')}`;
        map[key] = { dayType: o.dayType, reason: o.reason || '' };
      }
      return map;
    })(),
    canEdit: (session.user as any).id === selectedUserId || canViewOthers,
    viewingUserId: selectedUserId,
    sessionUserId: (session.user as any).id,
  };

  return <SummaryClient {...serializedData} />;
}
