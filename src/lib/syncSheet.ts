import { prisma } from "./prisma";
import { calculateDailyStats, formatTime } from "./attendanceCalc";

export async function syncSpreadsheetDaily(userId: string, dateStr: string) {
  const webhookUrl = process.env.GAS_WEBHOOK_URL;
  if (!webhookUrl) return;

  const targetDate = new Date(dateStr);
  const base = new Date(targetDate);
  if (base.getHours() < 5) base.setDate(base.getDate() - 1);
  const startOfDay = new Date(base);
  startOfDay.setHours(5, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  endOfDay.setHours(4, 59, 59, 999);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      attendances: {
        where: { timestamp: { gte: startOfDay, lte: endOfDay } },
        orderBy: { timestamp: 'asc' }
      }
    }
  });

  if (!user) return;

  const stats = calculateDailyStats(user.attendances);
  const clockInRecord = user.attendances.find((a: any) => a.type === "CLOCK_IN");
  const clockOutRecord = user.attendances.find((a: any) => a.type === "CLOCK_OUT");

  let status = "未出勤";
  if (clockInRecord && !clockOutRecord) status = "勤務中";
  if (clockInRecord && clockOutRecord) status = "退勤済";

  const y = startOfDay.getFullYear();
  const m = String(startOfDay.getMonth() + 1).padStart(2, '0');
  const d = String(startOfDay.getDate()).padStart(2, '0');
  const formattedDate = `${y}/${m}/${d}`; // "2026/03/25"

  const payload = {
    date: formattedDate,
    name: user.name || "名称未設定",
    clockIn: clockInRecord ? new Date(clockInRecord.timestamp).toLocaleTimeString("ja-JP", {hour: '2-digit', minute: '2-digit'}) : "",
    clockOut: clockOutRecord ? new Date(clockOutRecord.timestamp).toLocaleTimeString("ja-JP", {hour: '2-digit', minute: '2-digit'}) : "",
    breakMinutes: stats.elapsedMinutes > 0 ? formatTime(stats.breakMinutes) : "",
    workingMinutes: stats.elapsedMinutes > 0 ? formatTime(stats.workingMinutes) : "",
    regularMinutes: stats.elapsedMinutes > 0 ? formatTime(stats.regularMinutes) : "",
    overtimeMinutes: stats.elapsedMinutes > 0 ? formatTime(stats.overtimeMinutes) : "",
    nightMinutes: stats.elapsedMinutes > 0 ? formatTime(stats.nightMinutes) : "",
    status: status
  };

  try {
    // 連携先のGASへ非同期POST送信
    await fetch(webhookUrl, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Failed to sync to Google Sheets:", error);
  }
}
