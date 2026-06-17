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

    // スプレッドシートへ同期送信（バックグラウンド実行・待たない）
    syncSpreadsheetDaily((session.user as any).id, new Date().toISOString()).catch(console.error);

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Failed to create record" };
  }
}

// ----------------------------------------------------------------------------------
// 過去の日付に対する出勤・退勤レコードを手動追加
// ----------------------------------------------------------------------------------
export async function addRecord(
  dateStr: string, // "YYYY/MM/DD" or "YYYY-MM-DD"
  timeStr: string, // "HH:MM" (JST、5時〜28時対応)
  type: "CLOCK_IN" | "CLOCK_OUT",
  targetUserId?: string
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  try {
    const userId = targetUserId || (session.user as any).id;
    if (!userId) return { error: "User ID not found in session" };

    const [hours, minutes] = timeStr.split(":").map(Number);
    const [yyyy, mm, dd] = dateStr.split(/[-\/]/).map(Number);

    // 入力されたJST時刻からUTCタイムスタンプを生成（ビジネスデー対応：24時以降は翌日扱い）
    let newTimestamp: Date;
    if (hours >= 24) {
      newTimestamp = new Date(Date.UTC(yyyy, mm - 1, dd + 1, hours - 24 - 9, minutes, 0, 0));
    } else {
      newTimestamp = new Date(Date.UTC(yyyy, mm - 1, dd, hours - 9, minutes, 0, 0));
    }

    await prisma.attendanceRecord.create({
      data: {
        userId,
        type,
        timestamp: newTimestamp,
      }
    });

    // スプレッドシートへ同期送信（バックグラウンド実行・待たない）
    syncSpreadsheetDaily(userId, newTimestamp.toISOString()).catch(console.error);

    revalidatePath("/");
    revalidatePath("/summary");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Failed to add record" };
  }
}

export async function deleteRecord(id: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  try {
    const record = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!record) return { error: "Not found" };
    
    await prisma.attendanceRecord.delete({ where: { id } });
    
    // スプレッドシートへ同期送信（バックグラウンド実行・待たない）
    syncSpreadsheetDaily((session.user as any).id, record.timestamp.toISOString()).catch(console.error);
    
    revalidatePath("/");
    revalidatePath("/summary");
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
    
    // スプレッドシートへ同期送信（バックグラウンド実行・待たない）
    syncSpreadsheetDaily((session.user as any).id, newTimestamp.toISOString()).catch(console.error);

    revalidatePath("/");
    revalidatePath("/summary");
    return { success: true };
  } catch (error) {
    return { error: "Failed to update record" };
  }
}

export async function updateBreakTime(dateStr: string, minutes: number | null, targetUserId?: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  try {
    const sessionUserId = (session.user as any).id;
    const userId = targetUserId || sessionUserId;

    const base = new Date(new Date(dateStr).getTime() + 9 * 60 * 60 * 1000);
    if (base.getUTCHours() < 5) base.setUTCDate(base.getUTCDate() - 1);
    
    const yyyy = base.getUTCFullYear();
    const mm = base.getUTCMonth();
    const dd = base.getUTCDate();

    const startOfDay = new Date(Date.UTC(yyyy, mm, dd, 5 - 9, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(yyyy, mm, dd + 1, 4 - 9, 59, 59, 999));

    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        userId,
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
            userId,
            type: "BREAK_TIME",
            timestamp: timestamp,
            breakMinutes: minutes
          } as any
        });
      }
    }

    // スプレッドシートへ同期送信（バックグラウンド実行・待たない）
    syncSpreadsheetDaily(userId, startOfDay.toISOString()).catch(console.error);

    revalidatePath("/");
    revalidatePath("/summary");
    return { success: true };
  } catch (error) {
    return { error: "Failed to update break time" };
  }
}

// ----------------------------------------------------------------------------------
// 本日の勤務ステータス（代休・振休・有給・欠勤）を登録・解除する
// ----------------------------------------------------------------------------------
export async function setDailyStatus(dateStr: string, statusType: string | null, consumedDateStr: string | null = null, targetUserId?: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  try {
    const userId = targetUserId || (session.user as any).id;
    
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

    // スプレッドシートへ同期送信（バックグラウンド実行・待たない）
    syncSpreadsheetDaily(userId, startOfDay.toISOString()).catch(console.error);

    revalidatePath("/");
    revalidatePath("/summary");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Failed to set daily status" };
  }
}

// ----------------------------------------------------------------------------------
// 管理者によるユーザーロール変更（3権限対応）
// ----------------------------------------------------------------------------------
const VALID_ROLES = ["USER", "MANAGER", "ADMIN"];

export async function updateUserRole(userId: string, newRole: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  const currentRole = (session.user as any).role;
  const currentUserId = (session.user as any).id;
  const currentDept = (session.user as any).department;

  // 権限チェック: MANAGER または ADMIN のみ
  if (currentRole !== "ADMIN" && currentRole !== "MANAGER") {
    return { error: "Not authorized" };
  }

  // バリデーション: 有効なロールのみ許可
  if (!VALID_ROLES.includes(newRole)) {
    return { error: "Invalid role" };
  }

  // 自分自身のロール変更を防止
  if (userId === currentUserId) {
    return { error: "Cannot change own role" };
  }

  // MANAGERの制限: USERへの変更のみ + 同一部署のみ
  if (currentRole === "MANAGER") {
    if (newRole !== "USER") {
      return { error: "Managers can only set role to USER" };
    }
    // 対象ユーザーが同一部署かチェック
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { department: true },
    });
    if (!targetUser || targetUser.department !== currentDept) {
      return { error: "Not authorized for this user" };
    }
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { role: newRole }
    });
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { error: "Failed to update role" };
  }
}

// ----------------------------------------------------------------------------------
// 管理責任者によるユーザー部署変更（ADMINのみ）
// ----------------------------------------------------------------------------------
export async function updateUserDepartment(userId: string, department: string | null) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  if ((session.user as any).role !== "ADMIN") {
    return { error: "Not authorized - ADMIN only" };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { department: department || null }
    });
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { error: "Failed to update department" };
  }
}

// ----------------------------------------------------------------------------------
// 祝日管理（ADMIN のみ）
// ----------------------------------------------------------------------------------
export async function addHoliday(dateStr: string, name: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };
  if ((session.user as any).role !== "ADMIN") return { error: "Not authorized" };

  try {
    const date = new Date(dateStr + "T00:00:00Z");
    await prisma.holiday.create({
      data: { date, name }
    });
    revalidatePath("/admin");
    revalidatePath("/summary");
    return { success: true };
  } catch (error: any) {
    if (error?.code === 'P2002') return { error: "この日付は既に登録されています" };
    return { error: "Failed to add holiday" };
  }
}

export async function deleteHoliday(id: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };
  if ((session.user as any).role !== "ADMIN") return { error: "Not authorized" };

  try {
    await prisma.holiday.delete({ where: { id } });
    revalidatePath("/admin");
    revalidatePath("/summary");
    return { success: true };
  } catch (error) {
    return { error: "Failed to delete holiday" };
  }
}

export async function syncJapaneseHolidays() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };
  if ((session.user as any).role !== "ADMIN") return { error: "Not authorized" };

  try {
    const res = await fetch("https://holidays-jp.github.io/api/v1/date.json");
    if (!res.ok) return { error: "祝日データの取得に失敗しました" };
    const data: Record<string, string> = await res.json();

    let added = 0;
    for (const [dateStr, name] of Object.entries(data)) {
      const date = new Date(dateStr + "T00:00:00Z");
      try {
        await prisma.holiday.upsert({
          where: { date },
          update: { name },
          create: { date, name }
        });
        added++;
      } catch (e) {
        // skip duplicates
      }
    }

    revalidatePath("/admin");
    revalidatePath("/summary");
    return { success: true, count: added };
  } catch (error) {
    console.error(error);
    return { error: "祝日データの同期に失敗しました" };
  }
}

// ----------------------------------------------------------------------------------
// 勤務種別のオーバーライド（管理者のみ）
// ----------------------------------------------------------------------------------
export async function setDayTypeOverride(dateStr: string, dayType: string | null, reason?: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "MANAGER") return { error: "Not authorized" };

  try {
    // dateStrは "YYYY/MM/DD" または "YYYY-MM-DD" 形式
    const [yyyy, mm, dd] = dateStr.split(/[-\/]/).map(Number);
    const date = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));

    if (!dayType) {
      // オーバーライドを削除（自動判定に戻す）
      await prisma.dayTypeOverride.deleteMany({ where: { date } });
    } else {
      await prisma.dayTypeOverride.upsert({
        where: { date },
        update: { dayType, reason: reason || null },
        create: { date, dayType, reason: reason || null }
      });
    }

    revalidatePath("/summary");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Failed to set day type override" };
  }
}
