"use client";

import { useState } from "react";
import { type DailySummary, fmtMin } from "@/lib/summaryCalc";

type MonthBreakdown = {
  month: number;
  periodStr: string;
  overtimeMin: number;
  holidayMin: number;
  totalMin: number;
};

type EmployeeOvertime = {
  id: string;
  name: string;
  department: string | null;
  dailySummaries: DailySummary[];
  monthlyOvertime: number;
  yearlyOvertime: number;
  monthlyBreakdowns?: MonthBreakdown[];
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

// 8:00～翌7:00の時間軸を30分刻み（46列）
const HALF_HOUR_SLOTS: number[] = [];
for (let i = 0; i < 23; i++) {
  const h = (8 + i) >= 24 ? (8 + i) - 24 : (8 + i);
  HALF_HOUR_SLOTS.push(h);        // :00
  HALF_HOUR_SLOTS.push(h + 0.5);  // :30
}
// 時間ヘッダー用（整数時のみ）
const HOUR_HEADERS: number[] = [];
for (let i = 0; i < 23; i++) {
  HOUR_HEADERS.push((8 + i) >= 24 ? (8 + i) - 24 : (8 + i));
}
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

// セルの色を労働基準法に基づいて判定（30分スロット対応）
function getCellInfo(
  clockIn: number,
  clockOut: number,
  breakMinutes: number,
  slot: number,
  dayOfWeek: string,
  isHolidayFlag: boolean
): { working: boolean; color: string; label: string } {
  const EMPTY = { working: false, color: '', label: '' };

  // slotを正規化: 0-7.5は24-31.5として扱う
  const normSlot = slot < 8 ? slot + 24 : slot;
  const slotWidth = 0.5; // 30分刻み

  // 勤務範囲外
  if (normSlot + slotWidth <= clockIn || normSlot >= clockOut) return EMPTY;

  // 休憩時間（breakMinutes > 0 のとき、12時台をスキップ）
  // 複数時間の休憩の場合は12時から始まる想定
  if (breakMinutes > 0) {
    const breakStartHour = 12;
    const breakSlots = Math.ceil(breakMinutes / 30); // 30分単位
    const slotRealH = slot >= 24 ? slot - 24 : slot;
    if (slotRealH >= breakStartHour && slotRealH < breakStartHour + breakSlots * 0.5) return EMPTY;
  }

  // ===== 累積労働時間を計算（30分単位） =====
  let cumulativeHours = 0;
  // clockInからnormSlotまでを0.5刻みでカウント
  const startSlot = roundDown30(clockIn);
  for (let s = startSlot; s <= normSlot; s += 0.5) {
    if (s >= clockOut) break;

    let fraction = 0.5;
    if (s < clockIn) fraction = Math.max(0, 0.5 - (clockIn - s));
    if (s + 0.5 > clockOut) fraction = Math.min(fraction, clockOut - s);

    const realS = s >= 24 ? s - 24 : s;
    if (breakMinutes > 0) {
      const breakStartHour = 12;
      const breakSlots = Math.ceil(breakMinutes / 30);
      if (realS >= breakStartHour && realS < breakStartHour + breakSlots * 0.5) continue;
    }

    cumulativeHours += fraction;
  }

  const realHour = slot >= 24 ? slot - 24 : slot;
  const nightFlag = isDeepNight(Math.floor(realHour));
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
            {/* 時間ヘッダー（1時間=2列のcolSpan） */}
            <tr>
              <th style={{ minWidth: 32, position: 'sticky', left: 0, zIndex: 3, background: '#F8F9FA' }}>日</th>
              <th style={{ minWidth: 22, position: 'sticky', left: 32, zIndex: 3, background: '#F8F9FA' }}>曜</th>
              <th style={{ minWidth: 72, position: 'sticky', left: 54, zIndex: 3, background: '#F8F9FA', fontSize: 10 }}>勤務時間</th>
              {HOUR_HEADERS.map(h => {
                const night = isDeepNight(h);
                return (
                  <th
                    key={h}
                    colSpan={2}
                    style={{
                      minWidth: 36,
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
                  {HALF_HOUR_SLOTS.map((slot, si) => {
                    if (isLeave || clockIn === null || clockOut === null) {
                      return <td key={si} style={{ minWidth: 18, height: 20 }} />;
                    }

                    const info = getCellInfo(clockIn, clockOut, d.breakMinutes, slot, d.dayOfWeek, d.isHoliday);
                    const isHalf = slot % 1 !== 0;
                    const realH = Math.floor(slot >= 24 ? slot - 24 : slot);
                    const mm = isHalf ? '30' : '00';

                    return (
                      <td
                        key={si}
                        style={{
                          backgroundColor: info.working ? info.color : 'transparent',
                          minWidth: 18,
                          height: 20,
                          borderLeft: isHalf ? 'none' : undefined,
                          borderRight: !isHalf ? '1px dotted #e0e0e0' : undefined,
                        }}
                        title={info.working ? `${d.date} ${realH}:${mm} - ${info.label}` : ''}
                      />
                    );
                  })}
                </tr>
              );
            })}

            {days.length === 0 && (
              <tr>
                <td
                  colSpan={HALF_HOUR_SLOTS.length + 3}
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

      {/* ===== 36協定管理表 ===== */}
      {selectedEmp?.monthlyBreakdowns && selectedEmp.monthlyBreakdowns.length > 0 && (() => {
        const bd = selectedEmp.monthlyBreakdowns!;
        const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);

        const getVal = (m: number): MonthBreakdown | undefined => bd.find(b => b.month === m);
        const fmtH = (min: number) => {
          if (!min) return '';
          const h = Math.floor(min / 60);
          const m = min % 60;
          return m > 0 ? `${h}:${m.toString().padStart(2, '0')}` : `${h}`;
        };

        // N か月平均を計算
        const getAvg = (m: number, n: number): string => {
          const vals: number[] = [];
          for (let i = 0; i < n; i++) {
            const target = m - i;
            if (target < 1) return '';
            const v = getVal(target);
            if (!v) return '';
            vals.push(v.totalMin);
          }
          if (vals.length < n) return '';
          const avg = vals.reduce((a, b) => a + b, 0) / n;
          return fmtH(Math.round(avg));
        };

        // N か月平均の数値版（超過判定用）
        const getAvgNum = (m: number, n: number): number | null => {
          const vals: number[] = [];
          for (let i = 0; i < n; i++) {
            const target = m - i;
            if (target < 1) return null;
            const v = getVal(target);
            if (!v) return null;
            vals.push(v.totalMin);
          }
          if (vals.length < n) return null;
          return vals.reduce((a, b) => a + b, 0) / n;
        };

        // 45h超過回数
        let exceed45count = 0;
        for (const b of bd) {
          if (b.overtimeMin > 45 * 60) exceed45count++;
        }

        const labelStyle: React.CSSProperties = {
          fontWeight: 600, fontSize: 11, background: '#F8F9FA', whiteSpace: 'nowrap',
          padding: '6px 10px', position: 'sticky', left: 0, zIndex: 1,
        };
        const valStyle: React.CSSProperties = {
          fontSize: 11, textAlign: 'center', padding: '6px 6px',
          fontVariantNumeric: 'tabular-nums', fontFamily: "'Inter', sans-serif",
          whiteSpace: 'nowrap',
        };
        const highlightRow: React.CSSProperties = {
          ...valStyle, background: '#FFFDE7', fontWeight: 700,
        };

        return (
          <div style={{ marginTop: 24 }}>
            <h3 className="form-label text-lg mb-4">年間残業管理表（36協定）</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="heatmap-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ ...labelStyle, background: '#F8F9FA', minWidth: 120 }}>締め日</th>
                    {allMonths.map(m => (
                      <th key={m} style={{ minWidth: 56, fontSize: 11, fontWeight: 700 }}>{m}月5日</th>
                    ))}
                  </tr>
                  <tr>
                    <th style={{ ...labelStyle, background: '#F8F9FA', fontSize: 10 }}>対象期間</th>
                    {allMonths.map(m => {
                      const v = getVal(m);
                      return <th key={m} style={{ fontSize: 9, fontWeight: 400, color: '#888' }}>{v?.periodStr || ''}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* 時間外労働 */}
                  <tr>
                    <td style={labelStyle}>時間外労働</td>
                    {allMonths.map(m => {
                      const v = getVal(m);
                      const exceed = v && v.overtimeMin > 45 * 60;
                      return <td key={m} style={{ ...valStyle, color: exceed ? 'var(--danger)' : undefined, fontWeight: exceed ? 700 : undefined }}>{v ? fmtH(v.overtimeMin) : ''}</td>;
                    })}
                  </tr>
                  {/* 休日労働 */}
                  <tr>
                    <td style={labelStyle}>休日労働</td>
                    {allMonths.map(m => {
                      const v = getVal(m);
                      return <td key={m} style={valStyle}>{v ? fmtH(v.holidayMin) : ''}</td>;
                    })}
                  </tr>
                  {/* 合計（黄色ハイライト） */}
                  <tr>
                    <td style={{ ...labelStyle, background: '#FFF9C4', fontWeight: 700 }}>時間外+休日 合計</td>
                    {allMonths.map(m => {
                      const v = getVal(m);
                      const total = v?.totalMin || 0;
                      const exceed = total > 45 * 60;
                      return <td key={m} style={{ ...highlightRow, color: exceed ? 'var(--danger)' : undefined }}>{v ? fmtH(total) : ''}</td>;
                    })}
                  </tr>
                  {/* 2～6か月平均 */}
                  {[2,3,4,5,6].map(n => (
                    <tr key={n}>
                      <td style={labelStyle}>{n}か月平均</td>
                      {allMonths.map(m => {
                        const avg = getAvg(m, n);
                        const avgNum = getAvgNum(m, n);
                        const exceed = avgNum !== null && avgNum > 80 * 60;
                        return <td key={m} style={{ ...valStyle, color: exceed ? 'var(--danger)' : undefined, fontWeight: exceed ? 700 : undefined }}>{avg}</td>;
                      })}
                    </tr>
                  ))}
                  {/* 45h超過回数 */}
                  <tr>
                    <td style={{ ...labelStyle, borderTop: '2px solid #DDD' }}>月45h超過回数</td>
                    {allMonths.map(m => {
                      const v = getVal(m);
                      if (!v) return <td key={m} style={valStyle}></td>;
                      // 累積カウント: 1月からm月までの超過回数
                      let count = 0;
                      for (let i = 1; i <= m; i++) {
                        const bv = getVal(i);
                        if (bv && bv.overtimeMin > 45 * 60) count++;
                      }
                      const exceed = count >= 6;
                      return <td key={m} style={{ ...valStyle, borderTop: '2px solid #DDD', color: exceed ? 'var(--danger)' : undefined, fontWeight: exceed ? 700 : undefined }}>{count}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            {/* 注意事項 */}
            <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
              ※ 月45時間超過は年6回まで ／ 2～6か月平均は80時間以内 ／ 単月100時間未満
            </div>
          </div>
        );
      })()}
    </div>
  );
}
