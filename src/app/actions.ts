"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { syncSpreadsheetDaily } from "@/lib/syncSheet";

export async function clock(type: "CLOCK_IN" | "CLOCK_OUT") {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  try {
    const userId = (session.user as any).id;
    if (!userId) {
      return { error: "User ID not found in session" };
    }

    await prisma.attendanceRecord.create({
      data: {
        userId: userId,
        type: type,
      }
    });

    // スプレッドシートへ同期送信
    await syncSpreadsheetDaily((session.user as any).id, new Date().toISOString());

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Failed to create record" };
  }
}

export async function deleteRecord(id: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  try {
    const record = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!record) return { error: "Not found" };
    
    await prisma.attendanceRecord.delete({ where: { id } });
    
    // スプレッドシートへ同期送信（削除結果を反映するため）
    await syncSpreadsheetDaily((session.user as any).id, record.timestamp.toISOString());
    
    revalidatePath("/");
    revalidatePath("/history");
    return { success: true };
  } catch (error) {
    return { error: "Failed to delete record" };
  }
}

export async function updateRecordTime(id: string, newTimeStr: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  try {
    const record = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!record) return { error: "Not found" };

    // 時刻文字列 (HH:MM) とBusiness Dayを基準にタイムスタンプを更新する
    const [hours, minutes] = newTimeStr.split(":").map(Number);
    // 元のタイムスタンプをJSTとして解釈
    const baseDate = new Date(record.timestamp.getTime() + 9 * 60 * 60 * 1000);
    if (baseDate.getUTCHours() < 5) baseDate.setUTCDate(baseDate.getUTCDate() - 1);
    
    // yyyy-mm-dd を特定
    const yyyy = baseDate.getUTCFullYear();
    const mm = baseDate.getUTCMonth();
    const dd = baseDate.getUTCDate();

    // 入力された JST hour, JST minute から対象のUTCタイムスタンプを生成
    let newTimestamp: Date;
    if (hours >= 24) {
      newTimestamp = new Date(Date.UTC(yyyy, mm, dd + 1, hours - 24 - 9, minutes, 0, 0));
    } else {
      newTimestamp = new Date(Date.UTC(yyyy, mm, dd, hours - 9, minutes, 0, 0));
    }

    await prisma.attendanceRecord.update({
      where: { id },
      data: { timestamp: newTimestamp }
    });
    
    // スプレッドシートへ同期送信
    await syncSpreadsheetDaily((session.user as any).id, newTimestamp.toISOString());

    revalidatePath("/");
    revalidatePath("/history");
    return { success: true };
  } catch (error) {
    return { error: "Failed to update record" };
  }
}

export async function updateBreakTime(dateStr: string, minutes: number | null) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  try {
    const base = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000);
    if (base.getUTCHours() < 5) base.setUTCDate(base.getUTCDate() - 1);
    
    const yyyy = base.getUTCFullYear();
    const mm = base.getUTCMonth();
    const dd = base.getUTCDate();

    const startOfDay = new Date(Date.UTC(yyyy, mm, dd, 5 - 9, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(yyyy, mm, dd + 1, 4 - 9, 59, 59, 999));

    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        userId: (session.user as any).id,
        type: "BREAK_TIME",
        timestamp: { gte: startOfDay, lte: endOfDay }
      }
    });

    if (minutes === null) {
      if (existing) await prisma.attendanceRecord.delete({ where: { id: existing.id } });
    } else {
      if (existing) {
        await prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: { breakMinutes: minutes } as any
        });
      } else {
        const timestamp = new Date(startOfDay);
        timestamp.setHours(12, 0, 0, 0); 
        await prisma.attendanceRecord.create({
          data: {
            userId: (session.user as any).id,
            type: "BREAK_TIME",
            timestamp: timestamp,
            breakMinutes: minutes
          } as any
        });
      }
    }

    // スプレッドシートへ同期送信
    await syncSpreadsheetDaily((session.user as any).id, startOfDay.toISOString());

    revalidatePath("/");
    revalidatePath("/history");
    return { success: true };
  } catch (error) {
    return { error: "Failed to update break time" };
  }
}

// ----------------------------------------------------------------------------------
// 本日の勤務ステータス（代休・振休・有給・欠勤）を登録・解除する
// ----------------------------------------------------------------------------------
export async function setDailyStatus(dateStr: string, statusType: string | null, consumedDateStr: string | null = null) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  try {
    const userId = (session.user as any).id;
    
    // JSTビジネスデーの境界を算出
    const base = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000);
    if (base.getUTCHours() < 5) base.setUTCDate(base.getUTCDate() - 1);
    const yyyy = base.getUTCFullYear();
    const mm = base.getUTCMonth();
    const dd = base.getUTCDate();
    const startOfDay = new Date(Date.UTC(yyyy, mm, dd, 5 - 9, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(yyyy, mm, dd + 1, 4 - 9, 59, 59, 999));

    // 既存のステータスレコード（STATUS_から始まるもの）を検索して削除
    const existingStatuses = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        timestamp: { gte: startOfDay, lte: endOfDay },
        type: { startsWith: "STATUS_" }
      }
    });

    for (const record of existingStatuses) {
      await prisma.attendanceRecord.delete({ where: { id: record.id } });
    }

    if (statusType) {
      // 新しいステータス（代休など）を登録（タイムスタンプはその日の適当な時間：ここではstartOfDay + 1時間）
      const recordTime = new Date(startOfDay.getTime() + 60 * 60 * 1000);
      await prisma.attendanceRecord.create({
        data: {
          userId,
          type: statusType, // 例："STATUS_DAIKYU"
          timestamp: recordTime,
          note: consumedDateStr // 代休等の対象となった出勤日（例: "2026/04/15(日)"）
        }
      });
    }

    // スプレッドシートへ同期送信
    await syncSpreadsheetDaily(userId, startOfDay.toISOString());

    revalidatePath("/");
    revalidatePath("/history");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Failed to set daily status" };
  }
}
