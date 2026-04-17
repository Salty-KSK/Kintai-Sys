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
    const baseDate = new Date(record.timestamp);
    if (baseDate.getHours() < 5) baseDate.setDate(baseDate.getDate() - 1);
    
    const newTimestamp = new Date(baseDate);
    if (hours >= 24) {
      newTimestamp.setDate(newTimestamp.getDate() + 1);
      newTimestamp.setHours(hours - 24, minutes, 0, 0);
    } else {
      newTimestamp.setHours(hours, minutes, 0, 0);
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
    const base = new Date(dateStr);
    if (base.getHours() < 5) base.setDate(base.getDate() - 1);
    
    const startOfDay = new Date(base);
    startOfDay.setHours(5, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setHours(4, 59, 59, 999);

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
