"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
// import { syncSpreadsheetDaily } from "@/lib/syncSheet"; // スプレッドシート同期を無効化（DB管理に一本化）

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
    // syncSpreadsheetDaily — 無効化済み

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

    // そのビジネスデーの同タイプの既存レコードを全削除（重複防止）
    const dayStart = new Date(Date.UTC(yyyy, mm - 1, dd, 5 - 9, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(yyyy, mm - 1, dd + 1, 12 - 9, 59, 59, 999));
    await prisma.attendanceRecord.deleteMany({
      where: {
        userId,
        type,
        timestamp: { gte: dayStart, lte: dayEnd }
      }
    });

    await prisma.attendanceRecord.create({
      data: {
        userId,
        type,
        timestamp: newTimestamp,
      }
    });

    // スプレッドシートへ同期送信（バックグラウンド実行・待たない）
    // syncSpreadsheetDaily — 無効化済み

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
    // syncSpreadsheetDaily — 無効化済み
    
    revalidatePath("/");
    revalidatePath("/summary");
    return { success: true };
  } catch (error) {
    return { error: "Failed to delete record" };
  }
}

export async function updateRecordTime(id: string, newTimeStr: string, businessDateStr?: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  try {
    const record = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!record) return { error: "Not found" };

    const [hours, minutes] = newTimeStr.split(":").map(Number);

    let yyyy: number, mm: number, dd: number;

    if (businessDateStr) {
      // 呼び出し元からビジネス日付が明示的に渡された場合はそれを使う
      const [y, m, d] = businessDateStr.split(/[-\/]/).map(Number);
      yyyy = y;
      mm = m - 1; // 0-indexed
      dd = d;
    } else {
      // レガシー: タイムスタンプから導出（後方互換）
      const baseDate = new Date(record.timestamp.getTime() + 9 * 60 * 60 * 1000);
      if (baseDate.getUTCHours() < 5) baseDate.setUTCDate(baseDate.getUTCDate() - 1);
      yyyy = baseDate.getUTCFullYear();
      mm = baseDate.getUTCMonth();
      dd = baseDate.getUTCDate();
    }

    let newTimestamp: Date;
    if (hours >= 24) {
      newTimestamp = new Date(Date.UTC(yyyy, mm, dd + 1, hours - 24 - 9, minutes, 0, 0));
    } else {
      newTimestamp = new Date(Date.UTC(yyyy, mm, dd, hours - 9, minutes, 0, 0));
    }

    // そのビジネスデーの同タイプの既存レコードを全削除してから新規作成
    // （重複レコードがあっても確実にクリーンになる）
    const dayStart = new Date(Date.UTC(yyyy, mm, dd, 5 - 9, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(yyyy, mm, dd + 1, 12 - 9, 59, 59, 999)); // 翌12:59 JST

    await prisma.attendanceRecord.deleteMany({
      where: {
        userId: record.userId,
        type: record.type,
        timestamp: { gte: dayStart, lte: dayEnd }
      }
    });

    await prisma.attendanceRecord.create({
      data: {
        userId: record.userId,
        type: record.type,
        timestamp: newTimestamp,
      }
    });
    
    // スプレッドシートへ同期送信（バックグラウンド実行・待たない）
    // syncSpreadsheetDaily — 無効化済み

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
    // syncSpreadsheetDaily — 無効化済み

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
    
    // 日付を明示的にパース（YYYY/MM/DD or YYYY-MM-DD）
    const [yyyy, mm, dd] = dateStr.split(/[-\/]/).map(Number);
    const startOfDay = new Date(Date.UTC(yyyy, mm - 1, dd, 5 - 9, 0, 0, 0));    // JST 05:00
    const endOfDay = new Date(Date.UTC(yyyy, mm - 1, dd + 1, 4 - 9, 59, 59, 999)); // JST 翌04:59

    // 既存のステータスレコード（STATUS_から始まるもの）を検索して削除
    const existingStatuses = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        timestamp: { gte: startOfDay, lte: endOfDay },
        type: { startsWith: "STATUS_" }
      }
    });

    // 振替休日が設定されていた場合、関連するDayTypeOverrideも削除
    for (const record of existingStatuses) {
      if (record.type === "STATUS_FURIKYU" && record.note) {
        const match = record.note.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (match) {
          const [, oy, om, od] = match.map(Number);
          const oldDateStart = new Date(Date.UTC(oy, om - 1, od, 0, 0, 0, 0));
          const oldDateEnd = new Date(Date.UTC(oy, om - 1, od, 23, 59, 59, 999));
          await prisma.dayTypeOverride.deleteMany({ where: { date: { gte: oldDateStart, lte: oldDateEnd }, userId } });
        }
      }
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
    // syncSpreadsheetDaily — 無効化済み

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
// 従業員の事前登録（ADMINまたはMANAGERのみ）
// ----------------------------------------------------------------------------------
export async function registerUser(data: {
  email: string;
  name: string;
  employeeId?: string | null;
  department?: string | null;
  position?: string | null;
  role: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  const currentRole = (session.user as any).role;
  const currentDept = (session.user as any).department;

  // 権限チェック: ADMIN または MANAGER
  if (currentRole !== "ADMIN" && currentRole !== "MANAGER") {
    return { error: "Not authorized" };
  }

  // MANAGERの制限: 同一部署のUSERのみ登録可能
  if (currentRole === "MANAGER") {
    if (data.role !== "USER") {
      return { error: "マネージャーは一般ユーザーのみ登録可能です" };
    }
    if (data.department !== currentDept) {
      return { error: "マネージャーは自身の部署のユーザーのみ登録可能です" };
    }
  }

  // バリデーション
  if (!data.email.trim()) {
    return { error: "メールアドレスは必須です" };
  }
  if (!data.name.trim()) {
    return { error: "名前は必須です" };
  }
  if (!VALID_ROLES.includes(data.role)) {
    return { error: "無効なロールです" };
  }

  try {
    // メールアドレスの重複チェック
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.trim() }
    });
    if (existingUser) {
      return { error: "このメールアドレスは既に登録されています" };
    }

    // 社員番号の重複チェック
    if (data.employeeId?.trim()) {
      const existingEmp = await prisma.user.findUnique({
        where: { employeeId: data.employeeId.trim() }
      });
      if (existingEmp) {
        return { error: "この社員番号は既に登録されています" };
      }
    }

    await prisma.user.create({
      data: {
        email: data.email.trim(),
        name: data.name.trim(),
        employeeId: data.employeeId?.trim() || null,
        department: data.department?.trim() || null,
        position: data.position?.trim() || null,
        role: data.role
      }
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "ユーザーの登録に失敗しました" };
  }
}

// ----------------------------------------------------------------------------------
// ユーザー情報の編集（ADMINまたはMANAGERのみ）
// ----------------------------------------------------------------------------------
export async function updateUser(userId: string, data: {
  name?: string;
  department?: string | null;
  position?: string | null;
  employeeId?: string | null;
  role?: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };

  const currentRole = (session.user as any).role;
  const currentUserId = (session.user as any).id;
  const currentDept = (session.user as any).department;

  if (currentRole !== "ADMIN" && currentRole !== "MANAGER") {
    return { error: "Not authorized" };
  }

  // 自分自身のロール変更を防止
  if (userId === currentUserId && data.role && data.role !== currentRole) {
    return { error: "自分自身のロールは変更できません" };
  }

  // MANAGERの制限
  if (currentRole === "MANAGER") {
    if (data.role && data.role !== "USER") {
      return { error: "マネージャーは一般ユーザーのみ設定可能です" };
    }
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }, select: { department: true }
    });
    if (!targetUser || targetUser.department !== currentDept) {
      return { error: "権限がありません" };
    }
  }

  if (data.role && !VALID_ROLES.includes(data.role)) {
    return { error: "無効なロールです" };
  }

  try {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim() || null;
    if (data.department !== undefined) updateData.department = data.department?.trim() || null;
    if (data.position !== undefined) updateData.position = data.position?.trim() || null;
    if (data.employeeId !== undefined) updateData.employeeId = data.employeeId?.trim() || null;
    if (data.role !== undefined) updateData.role = data.role;

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "ユーザー情報の更新に失敗しました" };
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
export async function setDayTypeOverride(dateStr: string, dayType: string | null, reason?: string, userId?: string | null) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "MANAGER") return { error: "Not authorized" };

  try {
    const [yyyy, mm, dd] = dateStr.split(/[-\/]/).map(Number);
    const date = new Date(Date.UTC(yyyy, mm - 1, dd, 3, 0, 0, 0)); // JST正午 = UTC 03:00
    const targetUserId = userId || null;

    // 既存を削除（UTC 00:00やUTC 03:00など時刻が異なるデータも確実に削除）
    const dateStart = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
    const dateEnd = new Date(Date.UTC(yyyy, mm - 1, dd, 23, 59, 59, 999));
    await prisma.dayTypeOverride.deleteMany({ where: { date: { gte: dateStart, lte: dateEnd }, userId: targetUserId } });

    if (dayType) {
      // 新規作成
      await prisma.dayTypeOverride.create({
        data: { date, userId: targetUserId, dayType, reason: reason || null }
      });
    }

    revalidatePath("/summary");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Failed to set day type override" };
  }
}

// ----------------------------------------------------------------------------------
// 振替休日の連動設定（管理者のみ）
// 休む日にSTATUS_FURIKYUを設定 + 出勤日のdayTypeをweekdayに変更
// ----------------------------------------------------------------------------------
export async function setFurikyuWithOverride(
  furikyuDateStr: string,  // 振替休日を取る日
  workDateStr: string,     // 振替出勤する日（土曜・祝日）
  userId: string
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) return { error: "Not authenticated" };
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "MANAGER") return { error: "Not authorized" };

  try {
    // 1. 振替休日の日にステータスを設定
    const [fy, fm, fd] = furikyuDateStr.split(/[-\/]/).map(Number);
    // JST正午(12:00) = UTC 03:00 に設定（ビジネスデー境界の中央で確実に正しい日に割り当て）
    const furikyuDate = new Date(Date.UTC(fy, fm - 1, fd, 3, 0, 0, 0));
    
    // 既存のSTATUS_レコードを確認（古い振替出勤日のDayTypeOverrideを削除するため）
    const fStart = new Date(Date.UTC(fy, fm - 1, fd, 5 - 9, 0, 0, 0));
    const fEnd = new Date(Date.UTC(fy, fm - 1, fd + 1, 4 - 9, 59, 59, 999));
    
    const existingStatuses = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        type: "STATUS_FURIKYU",
        timestamp: { gte: fStart, lte: fEnd }
      }
    });
    
    // 古い振替出勤日のDayTypeOverrideを削除
    for (const old of existingStatuses) {
      if (old.note) {
        const match = old.note.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (match) {
          const [, oyS, omS, odS] = match;
          const [oy, om, od] = [Number(oyS), Number(omS), Number(odS)];
          const oldDateStart = new Date(Date.UTC(oy, om - 1, od, 0, 0, 0, 0));
          const oldDateEnd = new Date(Date.UTC(oy, om - 1, od, 23, 59, 59, 999));
          await prisma.dayTypeOverride.deleteMany({ where: { date: { gte: oldDateStart, lte: oldDateEnd }, userId } });
        }
      }
    }
    
    // 既存のSTATUS_レコードを全削除
    await prisma.attendanceRecord.deleteMany({
      where: {
        userId,
        type: { startsWith: "STATUS_" },
        timestamp: { gte: fStart, lte: fEnd }
      }
    });
    
    await prisma.attendanceRecord.create({
      data: {
        userId,
        type: "STATUS_FURIKYU",
        timestamp: furikyuDate,
        note: `振替出勤日: ${workDateStr}`
      }
    });

    // 2. 振替出勤日のdayTypeをweekdayに変更（対象ユーザーのみ）
    const [wy, wm, wd] = workDateStr.split(/[-\/]/).map(Number);
    // JST正午(12:00) = UTC 03:00
    const workDate = new Date(Date.UTC(wy, wm - 1, wd, 3, 0, 0, 0));
    
    await prisma.dayTypeOverride.deleteMany({
      where: {
        date: { gte: new Date(Date.UTC(wy, wm - 1, wd, 0, 0, 0, 0)), lte: new Date(Date.UTC(wy, wm - 1, wd, 23, 59, 59, 999)) },
        userId
      }
    });
    await prisma.dayTypeOverride.create({
      data: { date: workDate, userId, dayType: "weekday", reason: `振替休日: ${furikyuDateStr}` }
    });

    revalidatePath("/summary");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "振替休日の設定に失敗しました" };
  }
}
