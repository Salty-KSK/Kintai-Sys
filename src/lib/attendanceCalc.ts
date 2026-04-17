// src/lib/attendanceCalc.ts

export type DailyStats = {
  clockIn: Date | null;
  clockOut: Date | null;
  elapsedMinutes: number;
  breakMinutes: number;
  workingMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;     // 22:00 - 05:00
  nightOvertimeMinutes: number; 
};

export function calculateDailyStats(records: { type: string, timestamp: Date | string }[]): DailyStats {
  const sorted = [...records].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const clockInRecord = sorted.find(r => r.type === "CLOCK_IN");
  // 複数退勤がある場合は最後のものを採用
  const clockOutRecords = sorted.filter(r => r.type === "CLOCK_OUT");
  const clockOutRecord = clockOutRecords.length > 0 ? clockOutRecords[clockOutRecords.length - 1] : null;

  const clockIn = clockInRecord ? new Date(clockInRecord.timestamp) : null;
  const clockOut = clockOutRecord ? new Date(clockOutRecord.timestamp) : null;

  if (!clockIn || !clockOut) {
    return {
      clockIn,
      clockOut,
      elapsedMinutes: 0,
      breakMinutes: 0,
      workingMinutes: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
      nightMinutes: 0,
      nightOvertimeMinutes: 0
    };
  }

  const elapsedMs = clockOut.getTime() - clockIn.getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));

  const breakRecord = sorted.find(r => r.type === "BREAK_TIME");

  // 手動上書き または 自動休憩ロジック(拘束時間が9時間以上の場合は1時間休憩、6時間以上の場合は45分)
  let breakMinutes = 0;
  if (breakRecord && typeof (breakRecord as any).breakMinutes === 'number') {
    breakMinutes = (breakRecord as any).breakMinutes;
  } else if (elapsedMinutes >= 9 * 60) {
    breakMinutes = 60;
  } else if (elapsedMinutes >= 6 * 60) {
    breakMinutes = 45;
  }

  const workingMinutes = Math.max(0, elapsedMinutes - breakMinutes);
  const regularMinutes = Math.min(8 * 60, workingMinutes);
  const overtimeMinutes = Math.max(0, workingMinutes - 8 * 60);

  // 時間ごとのシミュレーションで深夜時間（22:00~05:00）を正確に判定
  let nightMinutes = 0;
  let nightOvertimeMinutes = 0;
  
  let current = new Date(clockIn.getTime());
  let elapsedWorkMins = 0;
  let currentBreak = breakMinutes;

  while (current < clockOut) {
    // 簡易的に拘束4時間経過後から休憩を消化すると仮定（昼休憩のシミュレーション）
    let isBreakMin = false;
    if (currentBreak > 0 && elapsedWorkMins > 4 * 60) {
      isBreakMin = true;
      currentBreak--;
    } else {
      elapsedWorkMins++;
    }

    const hour = current.getHours();
    const isNight = hour >= 22 || hour < 5;

    if (!isBreakMin && isNight) {
      nightMinutes++;
      // 実働8時間（480分）を超えた後の深夜労働は「深夜残業」とする
      if (elapsedWorkMins > 8 * 60) {
        nightOvertimeMinutes++;
      }
    }
    
    current.setMinutes(current.getMinutes() + 1);
  }

  return {
    clockIn,
    clockOut,
    elapsedMinutes,
    breakMinutes,
    workingMinutes,
    regularMinutes,
    overtimeMinutes: Math.max(0, overtimeMinutes - nightOvertimeMinutes),
    nightMinutes,
    nightOvertimeMinutes
  };
}

export function formatTime(mins: number) {
  if (!mins) return "0:00";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}
