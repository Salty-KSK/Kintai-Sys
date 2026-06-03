"use client";

import { useState } from "react";
import { type DailySummary, fmtMin } from "@/lib/summaryCalc";

type EmployeeOvertime = {
  id: string;
  name: string;
  department: string | null;
  dailySummaries: DailySummary[];
  monthlyOvertime: number;
  yearlyOvertime: number;
};

type OvertimeData = {
  year: number;
  month: number;
  periodStr: string;
  employees: EmployeeOvertime[];
};

type Props = {
  overtimeData: OvertimeData;
};

// 8時～翌7時の時間軸（23列）
const HOUR_COLUMNS: number[] = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4,5,6];
const DOW_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

// clockIn/clockOut文字列を数値に変換（"8:30"→8.5, "25:00"→25）
function parseTime(timeStr: string | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0]);
  const m = parseInt(parts[1]) || 0;
  return h + m / 60;
}

// 30分単位切り捨て（出勤用）: 8:12 → 8:00, 8:45 → 8:30
function roundDown30(time: number): number {
  return Math.floor(time * 2) / 2;
}

// 30分単位切り上げ（退勤用）: 21:45 → 22:00, 21:15 → 21:30
function roundUp30(time: number): number {
  return Math.ceil(time * 2) / 2;
}

// 数値時刻→表示文字列
function formatTime(time: number): string {
  const h = Math.floor(time);
  const m = Math.round((time - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

// 深夜帯判定（22:00～5:00）
function isDeepNight(hour: number): boolean {
  return hour >= 22 || (hour >= 0 && hour < 5);
}

// セルの色を労働基準法に基づいて判定
function getCellInfo(
  clockIn: number,
  clockOut: number,
  breakMinutes: number,
  hour: number,
  dayOfWeek: string,
  isHolidayFlag: boolean
): { working: boolean; color: string; label: string } {
  const EMPTY = { working: false, color: '', label: '' };

  // hourを正規化: 0-7は24-31として扱う（clockIn/Outが24+で来る前提）
  const normHour = hour < 8 ? hour + 24 : hour;

  // 勤務範囲外
  if (normHour + 1 <= clockIn || normHour >= clockOut) return EMPTY;

  // 休憩時間（breakMinutes > 0 のとき、12時台をスキップ）
  // 複数時間の休憩の場合は12時から始まる想定
  if (breakMinutes > 0) {
    const breakStartHour = 12;
    const breakHours = Math.ceil(breakMinutes / 60);
    if (hour >= breakStartHour && hour < breakStartHour + breakHours) return EMPTY;
  }

  // ===== 累積労働時間を計算 =====
  // clockInからnormHourまでに何時間働いたか（休憩除く）
  let cumulativeHours = 0;
  for (let h = Math.floor(clockIn); h <= normHour; h++) {
    if (h >= clockOut) break;

    // このスロットの実働割合
    let fraction = 1;
    if (h < clockIn) fraction = Math.max(0, 1 - (clockIn - h)); // 開始が途中
    if (h + 1 > clockOut) fraction = Math.min(fraction, clockOut - h); // 終了が途中

    // 休憩チェック
    const realH = h >= 24 ? h - 24 : h;
    if (breakMinutes > 0) {
      const breakStartHour = 12;
      const breakHours = Math.ceil(breakMinutes / 60);
      if (realH >= breakStartHour && realH < breakStartHour + breakHours) continue;
    }

    cumulativeHours += fraction;
  }

  const nightFlag = isDeepNight(hour);
  const isSunday = dayOfWeek === '日' || isHolidayFlag;
  const isSaturday = dayOfWeek === '土' && !isHolidayFlag;
  const isOvertime = cumulativeHours > 8;

  // ===== 色分け（日本労働基準法準拠）=====

  // 法定休日（日曜・祝日）: 所定/残業の区別なし
  if (isSunday) {
    if (nightFlag) return { working: true, color: '#FFD54F', label: '法定休日+深夜（×1.6）' };
    return { working: true, color: '#FF8A65', label: '法定休日（×1.35）' };
  }

  // 法定外休日（土曜）: 全て時間外扱い
  if (isSaturday) {
    if (nightFlag) return { working: true, color: '#EF9A9A', label: '法定外休日+深夜（×1.5）' };
    return { working: true, color: '#FFB74D', label: '法定外休日（×1.25）' };
  }

  // 平日
  if (isOvertime) {
    if (nightFlag) return { working: true, color: '#EF9A9A', label: '法定時間外+深夜（×1.5）' };
    return { working: true, color: '#FFB74D', label: '法定時間外（×1.25）' };
  }

  // 所定労働
  if (nightFlag) return { working: true, color: '#FFF176', label: '深夜所定（×1.25）' };
  return { working: true, color: '#64B5F6', label: '所定労働' };
}

const LEGEND_ITEMS = [
  { color: '#64B5F6', label: '所定労働時間（1倍 割増なし）' },
  { color: '#FFF176', label: '深夜労働 22:00-5:00（1.25倍 割増）' },
  { color: '#FFB74D', label: '法定時間外労働（1.25倍 割増）' },
  { color: '#EF9A9A', label: '法定時間外+深夜労働（1.5倍 割増）' },
  { color: '#FF8A65', label: '法定休日労働（1.35倍 割増）' },
  { color: '#FFD54F', label: '法定休日+深夜労働（1.6倍 割増）' },
];

export default function OvertimeHeatmap({ overtimeData }: Props) {
  const { periodStr, employees } = overtimeData;
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || '');

  const selectedEmp = employees.find(e => e.id === selectedEmpId);
  const days = selectedEmp?.dailySummaries || [];

  const monthlyExceed = (selectedEmp?.monthlyOvertime || 0) > 45 * 60;
  const yearlyExceed = (selectedEmp?.yearlyOvertime || 0) > 360 * 60;

  return (
    <div className="card animate-fade-in">
      <h3 className="form-label text-lg mb-4">残業管理ヒートマップ</h3>

      {/* 上限注意 */}
      <div
        style={{
          backgroundColor: '#FEF7E0',
          border: '1px solid #FDD835',
          borderRadius: 12,
          padding: '10px 16px',
          marginBottom: 16,
          fontSize: 13,
          color: '#5D4037',
          fontWeight: 600,
        }}
      >
        ⚠ 2024（令和6）年4月1日以降は、時間外労働の上限は原則として月45時間・年360時間
      </div>

      {/* 従業員選択 + 期間 + 集計 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <select
          value={selectedEmpId}
          onChange={e => setSelectedEmpId(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--google-border)',
            fontSize: 14,
            minWidth: 160,
            display: employees.length <= 1 ? 'none' : 'block',
          }}
        >
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.name}</option>
          ))}
        </select>

        <span style={{ fontSize: 13, color: 'var(--google-text-sub)', fontWeight: 500 }}>
          期間: {periodStr}
        </span>

        {selectedEmp && (
          <div style={{ display: 'flex', gap: 16, marginLeft: 'auto', fontSize: 13 }}>
            <span>
              月合計残業:
              <strong style={{ marginLeft: 4, color: monthlyExceed ? 'var(--danger)' : 'inherit' }}>
                {monthlyExceed && '⚠ '}{fmtMin(selectedEmp.monthlyOvertime)}
              </strong>
            </span>
            <span>
              年累計残業:
              <strong style={{ marginLeft: 4, color: yearlyExceed ? 'var(--danger)' : 'inherit' }}>
                {yearlyExceed && '⚠ '}{fmtMin(selectedEmp.yearlyOvertime)}
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* ヒートマップテーブル */}
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <table className="heatmap-table">
          <thead>
            {/* 時間行 */}
            <tr>
              <th style={{ minWidth: 32, position: 'sticky', left: 0, zIndex: 3, background: '#F8F9FA' }}>日</th>
              <th style={{ minWidth: 22, position: 'sticky', left: 32, zIndex: 3, background: '#F8F9FA' }}>曜</th>
              <th style={{ minWidth: 72, position: 'sticky', left: 54, zIndex: 3, background: '#F8F9FA', fontSize: 10 }}>勤務時間</th>
              {HOUR_COLUMNS.map(h => {
                const night = isDeepNight(h);
                return (
                  <th
                    key={h}
                    style={{
                      minWidth: 24,
                      fontSize: 10,
                      background: night ? '#F5F5F5' : '#F8F9FA',
                      color: night ? '#9E9E9E' : '#5F6368',
                    }}
                  >
                    {h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => {
              const dayNum = parseInt(d.date.split('/')[2]);
              const dowIdx = DOW_NAMES.indexOf(d.dayOfWeek);
              const isSun = dowIdx === 0 || d.isHoliday;
              const isSat = dowIdx === 6;
              const dowColor = isSun ? 'var(--danger)' : isSat ? 'var(--google-primary)' : '#333';

              const isLeave = d.status?.includes('有給') || d.status?.includes('代休') || d.status?.includes('振休') || d.status?.includes('欠勤');

              const rawIn = parseTime(d.clockIn);
              const rawOut = parseTime(d.clockOut);
              const clockIn = rawIn !== null ? roundDown30(rawIn) : null;
              const clockOut = rawOut !== null ? roundUp30(rawOut) : null;

              return (
                <tr key={i}>
                  <td style={{
                    fontWeight: 600,
                    textAlign: 'center',
                    position: 'sticky',
                    left: 0,
                    background: 'white',
                    zIndex: 1,
                    fontSize: 11,
                  }}>
                    {dayNum}
                  </td>
                  <td style={{
                    color: dowColor,
                    fontWeight: 700,
                    textAlign: 'center',
                    position: 'sticky',
                    left: 32,
                    background: 'white',
                    zIndex: 1,
                    fontSize: 11,
                  }}>
                    {d.dayOfWeek}
                  </td>
                  <td style={{
                    textAlign: 'center',
                    position: 'sticky',
                    left: 54,
                    background: 'white',
                    zIndex: 1,
                    fontSize: 10,
                    fontWeight: 500,
                    color: 'var(--google-text-sub)',
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: "'Inter', sans-serif",
                    whiteSpace: 'nowrap',
                    minWidth: 72,
                  }}>
                    {isLeave ? '' : (clockIn !== null && clockOut !== null ? `${formatTime(clockIn)}～${formatTime(clockOut)}` : '')}
                  </td>
                  {HOUR_COLUMNS.map(h => {
                    if (isLeave || clockIn === null || clockOut === null) {
                      return <td key={h} style={{ minWidth: 24, height: 18 }} />;
                    }

                    const info = getCellInfo(clockIn, clockOut, d.breakMinutes, h, d.dayOfWeek, d.isHoliday);

                    return (
                      <td
                        key={h}
                        style={{
                          backgroundColor: info.working ? info.color : 'transparent',
                          minWidth: 24,
                          height: 18,
                        }}
                        title={info.working ? `${d.date} ${h}:00 - ${info.label}` : ''}
                      />
                    );
                  })}
                </tr>
              );
            })}

            {days.length === 0 && (
              <tr>
                <td
                  colSpan={HOUR_COLUMNS.length + 2}
                  style={{ padding: '24px 0', textAlign: 'center', color: 'var(--google-text-sub)' }}
                >
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div className="heatmap-legend">
        {LEGEND_ITEMS.map((item, i) => (
          <div key={i} className="heatmap-legend-item">
            <div className="heatmap-legend-color" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
