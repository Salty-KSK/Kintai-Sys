// src/lib/summaryCalc.ts
// 勤務集計ページ用の計算ロジック（スプレッドシートの勤務集計と同等）

export type DayType = "weekday" | "saturday" | "sunday" | "holiday";
export type LeaveType = "STATUS_DAIKYU" | "STATUS_FURIKYU" | "STATUS_YUKYU" | "STATUS_KEKKIN" | null;

export type DailySummary = {
  date: string;           // "2026/04/01"
  dayOfWeek: string;      // "月","火",...
  dayType: DayType;
  isHoliday: boolean;     // 祝日フラグ

  rawClockIn: string;     // 実打刻 "8:06"
  rawClockOut: string;    // 実打刻 "19:19"
  clockIn: string;        // 15分繰り上げ後 "8:15"
  clockOut: string;       // 15分繰り上げ後 "19:30"
  breakMinutes: number;   // 休憩（分）

  regularMinutes: number; // 所定（max 8h）
  overtimeMinutes: number;// 残業（8h超）
  nightRegularMin: number;// 深夜所定（22-5時, 8h以内）
  nightOvertimeMin: number;// 深夜残業（22-5時, 8h超）
  holidaySatMin: number;  // 法定外休日（土曜）
  holidaySatNightMin: number; // 法定外休日深夜
  holidaySunMin: number;  // 法定休日（日曜）
  holidaySunNightMin: number; // 法定休日深夜
  totalNightMin: number;  // 深夜合計

  leaveType: LeaveType;
  leaveNote: string;      // "2026/04/11(土)" etc.
  isFurikaeWork: boolean; // 振替出勤日
  status: string;         // "退勤済","有給休暇" etc.
};

export type MonthlySummary = {
  weekdayRegular: number;
  weekdayOvertime: number;
  weekdayNightRegular: number;
  weekdayNightOvertime: number;
  satHoliday: number;
  satHolidayOvertime: number;
  satNight: number;
  sunHoliday: number;
  sunHolidayOvertime: number;
  sunNight: number;
  totalDays: number;
  workDays: number;
  holidayWorkDays: number;
  yukyuDays: number;
  daikyuDays: number;
  kekkinDays: number;
  furikyuDays: number;
};

const DOW_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 15分単位で繰り上げ（CEILING）
 */
export function ceilTo15(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

/**
 * 分を "H:MM" 形式にフォーマット
 */
export function fmtMin(min: number): string {
  if (min <= 0) return "0:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

/**
 * JSTの時分を分単位で取得
 */
function getJSTMinutes(date: Date): number {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}

/**
 * 22:00-29:00 (翌5:00) の深夜時間帯の分数を計算
 * inMin, outMin は 0:00 起算の分（日跨ぎは 24*60+ で表現）
 */
function calcNightMinutes(inMin: number, outMin: number): number {
  const nightStart = 22 * 60;
  const nightEnd = 29 * 60; // 翌5:00
  if (outMin <= nightStart) return 0;
  const effectiveIn = Math.max(inMin, nightStart);
  const effectiveOut = Math.min(outMin, nightEnd);
  return Math.max(0, effectiveOut - effectiveIn);
}

/**
 * ビジネスデーの期間を生成（26日〜翌月25日）
 */
export function getBusinessPeriod(year: number, month: number): { start: Date; end: Date } {
  // month は 1-indexed (4 = April)
  const start = new Date(Date.UTC(year, month - 2, 26, -9, 0, 0)); // 前月26日 JST
  const end = new Date(Date.UTC(year, month - 1, 26, 4 - 9, 59, 59, 999)); // 当月25日 翌04:59 JST
  return { start, end };
}

/**
 * 指定期間の全日付を生成
 */
export function generateDateRange(year: number, month: number): Date[] {
  const dates: Date[] = [];
  // 前月26日から当月25日まで
  const startMonth = month - 1; // 0-indexed
  const d = new Date(year, startMonth - 1, 26); // 前月26日
  const endDate = new Date(year, startMonth, 25); // 当月25日

  while (d <= endDate) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/**
 * 1日分の勤務集計を計算
 */
export function calculateDailySummary(
  date: Date,
  records: { type: string; timestamp: Date | string; breakMinutes?: number | null; note?: string | null }[],
  holidays: Date[],
  dayTypeOverride?: DayType | null
): DailySummary {
  const dow = date.getDay();
  const dateStr = `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getDate().toString().padStart(2, "0")}`;
  const dayOfWeek = DOW_NAMES[dow];

  // 祝日チェック
  const isHoliday = holidays.some(h => {
    const hd = new Date(h);
    return hd.getFullYear() === date.getFullYear() &&
           hd.getMonth() === date.getMonth() &&
           hd.getDate() === date.getDate();
  });

  let dayType: DayType = "weekday";
  if (dow === 0) dayType = "sunday";
  else if (dow === 6) dayType = "saturday";
  if (isHoliday && dayType === "weekday") dayType = "holiday";

  // 管理者によるオーバーライドがあれば適用
  if (dayTypeOverride) {
    dayType = dayTypeOverride;
  }

  // ステータスレコード確認
  const statusRecord = records.find(r => r.type.startsWith("STATUS_"));
  let leaveType: LeaveType = null;
  let leaveNote = "";
  if (statusRecord) {
    leaveType = statusRecord.type as LeaveType;
    leaveNote = statusRecord.note || "";
  }

  // 振替出勤判定: 振替休日の対象日（note に記載）が別日にある場合、
  // この日が土日でも通常勤務扱いになる → ステータスが無い休日出勤で、
  // 別日に STATUS_FURIKYU が存在する場合に判定
  // 簡易実装: ステータスレコードがなく、出退勤記録がある休日
  const isFurikaeWork = false; // サーバー側で判定して渡す

  // 休暇日の場合
  if (leaveType) {
    let statusName = "";
    switch (leaveType) {
      case "STATUS_DAIKYU": statusName = "代休"; break;
      case "STATUS_FURIKYU": statusName = "振替休日"; break;
      case "STATUS_YUKYU": statusName = "有給休暇"; break;
      case "STATUS_KEKKIN": statusName = "欠勤"; break;
    }
    if (leaveNote) statusName += ` (${leaveNote})`;

    return {
      date: dateStr, dayOfWeek, dayType, isHoliday,
      rawClockIn: "", rawClockOut: "", clockIn: "", clockOut: "",
      breakMinutes: 0, regularMinutes: 0, overtimeMinutes: 0,
      nightRegularMin: 0, nightOvertimeMin: 0,
      holidaySatMin: 0, holidaySatNightMin: 0,
      holidaySunMin: 0, holidaySunNightMin: 0,
      totalNightMin: 0,
      leaveType, leaveNote, isFurikaeWork: false,
      status: statusName
    };
  }

  // 出退勤レコード取得
  const sorted = [...records].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const clockInRec = sorted.find(r => r.type === "CLOCK_IN");
  const clockOutRecs = sorted.filter(r => r.type === "CLOCK_OUT");
  const clockOutRec = clockOutRecs.length > 0 ? clockOutRecs[clockOutRecs.length - 1] : null;

  if (!clockInRec || !clockOutRec) {
    return {
      date: dateStr, dayOfWeek, dayType, isHoliday,
      rawClockIn: clockInRec ? fmtJSTTime(new Date(clockInRec.timestamp)) : "",
      rawClockOut: "",
      clockIn: clockInRec ? fmtJSTTime15(new Date(clockInRec.timestamp)) : "",
      clockOut: "",
      breakMinutes: 0, regularMinutes: 0, overtimeMinutes: 0,
      nightRegularMin: 0, nightOvertimeMin: 0,
      holidaySatMin: 0, holidaySatNightMin: 0,
      holidaySunMin: 0, holidaySunNightMin: 0,
      totalNightMin: 0,
      leaveType: null, leaveNote: "", isFurikaeWork: false,
      status: clockInRec ? "勤務中" : "未出勤"
    };
  }

  const ciDate = new Date(clockInRec.timestamp);
  const coDate = new Date(clockOutRec.timestamp);

  // 実打刻時刻
  const rawIn = fmtJSTTime(ciDate);
  const rawOut = fmtJSTTime(coDate);

  // 15分繰り上げ
  const inMin = ceilTo15(getJSTMinutes(ciDate));
  const outMinRaw = getJSTMinutes(coDate);
  let outMin = ceilTo15(outMinRaw);
  // 日跨ぎ対応
  if (outMin < inMin) outMin += 24 * 60;

  const clockIn = fmtMin(inMin);
  const clockOut = fmtMin(outMin);

  // 休憩計算
  const breakRec = sorted.find(r => r.type === "BREAK_TIME");
  let breakMinutes = 0;
  if (breakRec && typeof breakRec.breakMinutes === "number") {
    breakMinutes = breakRec.breakMinutes;
  } else {
    const elapsed = outMin - inMin;
    if (elapsed >= 9 * 60) breakMinutes = 60;
    else if (elapsed >= 6 * 60) breakMinutes = 45;
  }

  const totalWork = Math.max(0, outMin - inMin - breakMinutes);

  // 深夜時間（22:00〜翌5:00）
  const nightTotal = calcNightMinutes(inMin, outMin);
  // 休憩は昼間に消化と仮定（深夜時間には影響しない）
  const effectiveNight = Math.min(nightTotal, totalWork);

  // 日種別に応じた分類
  const isRegularDay = dayType === "weekday" || (isHoliday ? false : false);
  // 土曜・日曜・祝日だが振替出勤の場合は通常日扱い
  const treatAsRegular = isRegularDay || isFurikaeWork;

  let regularMinutes = 0, overtimeMinutes = 0;
  let nightRegularMin = 0, nightOvertimeMin = 0;
  let holidaySatMin = 0, holidaySatNightMin = 0;
  let holidaySunMin = 0, holidaySunNightMin = 0;

  if (treatAsRegular) {
    // 通常日 or 振替出勤
    regularMinutes = Math.min(totalWork, 480);
    overtimeMinutes = Math.max(0, totalWork - 480);
    // 深夜分類
    if (totalWork <= 480) {
      nightRegularMin = effectiveNight;
      nightOvertimeMin = 0;
    } else {
      nightOvertimeMin = effectiveNight;
      nightRegularMin = 0;
    }
  } else if (dayType === "saturday" || (isHoliday && dow !== 0)) {
    // 法定外休日（土曜 or 祝日で日曜以外）
    const nonNight = Math.max(0, totalWork - effectiveNight);
    holidaySatMin = nonNight;
    holidaySatNightMin = effectiveNight;
  } else if (dayType === "sunday") {
    // 法定休日（日曜）
    const nonNight = Math.max(0, totalWork - effectiveNight);
    holidaySunMin = nonNight;
    holidaySunNightMin = effectiveNight;
  }

  return {
    date: dateStr, dayOfWeek, dayType, isHoliday,
    rawClockIn: rawIn, rawClockOut: rawOut,
    clockIn, clockOut,
    breakMinutes,
    regularMinutes, overtimeMinutes,
    nightRegularMin, nightOvertimeMin,
    holidaySatMin, holidaySatNightMin,
    holidaySunMin, holidaySunNightMin,
    totalNightMin: effectiveNight,
    leaveType: null, leaveNote: "", isFurikaeWork,
    status: "退勤済"
  };
}

/**
 * 月間サマリーを計算
 */
export function calculateMonthlySummary(days: DailySummary[]): MonthlySummary {
  const s: MonthlySummary = {
    weekdayRegular: 0, weekdayOvertime: 0,
    weekdayNightRegular: 0, weekdayNightOvertime: 0,
    satHoliday: 0, satHolidayOvertime: 0, satNight: 0,
    sunHoliday: 0, sunHolidayOvertime: 0, sunNight: 0,
    totalDays: days.length, workDays: 0, holidayWorkDays: 0,
    yukyuDays: 0, daikyuDays: 0, kekkinDays: 0, furikyuDays: 0
  };

  for (const d of days) {
    if (d.leaveType === "STATUS_YUKYU") { s.yukyuDays++; continue; }
    if (d.leaveType === "STATUS_DAIKYU") { s.daikyuDays++; continue; }
    if (d.leaveType === "STATUS_KEKKIN") { s.kekkinDays++; continue; }
    if (d.leaveType === "STATUS_FURIKYU") { s.furikyuDays++; continue; }

    if (d.regularMinutes > 0 || d.overtimeMinutes > 0) s.workDays++;
    if (d.holidaySatMin > 0 || d.holidaySunMin > 0) s.holidayWorkDays++;

    s.weekdayRegular += d.regularMinutes;
    s.weekdayOvertime += d.overtimeMinutes;
    s.weekdayNightRegular += d.nightRegularMin;
    s.weekdayNightOvertime += d.nightOvertimeMin;
    s.satHoliday += d.holidaySatMin;
    s.satNight += d.holidaySatNightMin;
    s.sunHoliday += d.holidaySunMin;
    s.sunNight += d.holidaySunNightMin;
  }

  return s;
}

function fmtJSTTime(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h = jst.getUTCHours();
  const m = jst.getUTCMinutes();
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function fmtJSTTime15(d: Date): string {
  const min = getJSTMinutes(d);
  return fmtMin(ceilTo15(min));
}
