import { prisma } from "./prisma";
import { calculateDailyStats, formatTime } from "./attendanceCalc";

export async function syncSpreadsheetDaily(userId: string, dateStr: string) {
  const webhookUrl = process.env.GAS_WEBHOOK_URL;
  if (!webhookUrl) return;

  const targetDate = new Date(dateStr);
  const base = new Date(targetDate.getTime() + 9 * 60 * 60 * 1000); // 仮想JST化
  if (base.getUTCHours() < 5) base.setUTCDate(base.getUTCDate() - 1);
  
  const yyyy = base.getUTCFullYear();
  const mm = base.getUTCMonth();
  const dd = base.getUTCDate();

  const startOfDay = new Date(Date.UTC(yyyy, mm, dd, 5 - 9, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(yyyy, mm, dd + 1, 4 - 9, 59, 59, 999));

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
  const statusRecord = user.attendances.find((a: any) => a.type.startsWith("STATUS_"));

  let status = "未出勤";
  if (clockInRecord && !clockOutRecord) status = "勤務中";
  if (clockInRecord && clockOutRecord) status = "退勤済";
  
  if (statusRecord) {
    if (statusRecord.type === "STATUS_DAIKYU") status = "代休";
    else if (statusRecord.type === "STATUS_FURIKYU") status = "振替休日";
    else if (statusRecord.type === "STATUS_YUKYU") status = "有給休暇";
    else if (statusRecord.type === "STATUS_KEKKIN") status = "欠勤";
    
    // 代休などの対象日（note）があれば合体させる
    if (statusRecord.note) {
      status = `${status} (${statusRecord.note}分)`;
    }
  }

  const formattedDate = `${yyyy}/${String(mm + 1).padStart(2, '0')}/${String(dd).padStart(2, '0')}`; // "2026/03/25"

  const payload = {
    date: formattedDate,
    name: user.name || "名称未設定",
    clockIn: clockInRecord && !statusRecord ? `${(new Date(clockInRecord.timestamp.getTime() + 9 * 60 * 60 * 1000).getUTCHours()).toString().padStart(2, '0')}:${(new Date(clockInRecord.timestamp.getTime() + 9 * 60 * 60 * 1000).getUTCMinutes()).toString().padStart(2, '0')}` : "",
    clockOut: clockOutRecord && !statusRecord ? `${(new Date(clockOutRecord.timestamp.getTime() + 9 * 60 * 60 * 1000).getUTCHours() < 5 ? new Date(clockOutRecord.timestamp.getTime() + 9 * 60 * 60 * 1000).getUTCHours() + 24 : new Date(clockOutRecord.timestamp.getTime() + 9 * 60 * 60 * 1000).getUTCHours()).toString().padStart(2, '0')}:${(new Date(clockOutRecord.timestamp.getTime() + 9 * 60 * 60 * 1000).getUTCMinutes()).toString().padStart(2, '0')}` : "",
    breakMinutes: stats.elapsedMinutes > 0 && !statusRecord ? formatTime(stats.breakMinutes) : "",
    workingMinutes: stats.elapsedMinutes > 0 && !statusRecord ? formatTime(stats.workingMinutes) : "",
    regularMinutes: stats.elapsedMinutes > 0 && !statusRecord ? formatTime(stats.regularMinutes) : "",
    overtimeMinutes: stats.elapsedMinutes > 0 && !statusRecord ? formatTime(stats.overtimeMinutes) : "",
    nightMinutes: stats.elapsedMinutes > 0 && !statusRecord ? formatTime(stats.nightMinutes) : "",
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
