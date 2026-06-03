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

function hourLabel(h: number): string {
  if (h >= 0 && h <= 6) return `${h}`;
  return `${h}`;
}

// 時間帯ごとの色
function getHourColor(hour: number): string {
  // 所定労働: 8-17 (8:00～17:00)
  if (hour >= 8 && hour < 17) return '#C8E6FF';
  // 法定時間外: 17-22 (17:00～22:00)
  if (hour >= 17 && hour < 22) return '#FFE0B2';
  // 法定時間外+深夜: 22-翌5 (22:00～5:00)
  if (hour >= 22 || hour < 5) return '#FFCDD2';
  // 翌5-翌7: 法定時間外 (5:00～7:00)
  return '#FFE0B2';
}

// clockIn/clockOut文字列を数値時間に変換（翌X時は24+X）
function parseTime(timeStr: string | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0]);
  const m = parseInt(parts[1]) || 0;
  return h + m / 60;
}

// その時間にその従業員が勤務中かどうか
function isWorking(d: DailySummary, hour: number): boolean {
  const inTime = parseTime(d.clockIn);
  const outTime = parseTime(d.clockOut);
  if (inTime === null || outTime === null) return false;

  // hour列の表す範囲: hour ～ hour+1
  // 翌日の0-6はcalc上は24-30に変換して比較
  let checkHour = hour;
  if (hour < 8) checkHour = hour + 24;

  let normIn = inTime;
  let normOut = outTime;
  // outが翌日の場合（outTime < inTime は通常ないが、翌X時表記で24+で来る想定）
  // summaryCalcが24+で返す場合はそのまま

  return checkHour >= normIn && checkHour < normOut;
}

const DOW_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const LEGEND_ITEMS = [
  { color: '#C8E6FF', label: '所定労働時間（8:00～17:00）' },
  { color: '#FFE0B2', label: '法定時間外（17:00～22:00 / 翌5:00～翌7:00）' },
  { color: '#FFCDD2', label: '法定時間外＋深夜（22:00～翌5:00）' },
];

export default function OvertimeHeatmap({ overtimeData }: Props) {
  const { periodStr, employees, year, month } = overtimeData;
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
              月合計:
              <strong style={{ marginLeft: 4, color: monthlyExceed ? 'var(--danger)' : 'inherit' }}>
                {monthlyExceed && '⚠ '}{fmtMin(selectedEmp.monthlyOvertime)}
              </strong>
            </span>
            <span>
              年累計:
              <strong style={{ marginLeft: 4, color: yearlyExceed ? 'var(--danger)' : 'inherit' }}>
                {yearlyExceed && '⚠ '}{fmtMin(selectedEmp.yearlyOvertime)}
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* ヒートマップテーブル: 縦=日付, 横=時間(8～翌7) */}
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <table className="heatmap-table">
          <thead>
            {/* 区分ヘッダー */}
            <tr>
              <th colSpan={2} style={{ position: 'sticky', left: 0, zIndex: 3, background: '#F8F9FA' }}></th>
              <th
                colSpan={9}
                style={{ background: '#E3F2FD', color: '#1565C0', borderBottom: '2px solid #90CAF9' }}
              >
                所定労働
              </th>
              <th
                colSpan={5}
                style={{ background: '#FFF3E0', color: '#E65100', borderBottom: '2px solid #FFB74D' }}
              >
                法定時間外
              </th>
              <th
                colSpan={7}
                style={{ background: '#FFEBEE', color: '#B71C1C', borderBottom: '2px solid #EF9A9A' }}
              >
                法定時間外＋深夜
              </th>
              <th
                colSpan={2}
                style={{ background: '#FFF3E0', color: '#E65100', borderBottom: '2px solid #FFB74D' }}
              >
                時間外
              </th>
            </tr>
            {/* 時間行 */}
            <tr>
              <th style={{ minWidth: 40, position: 'sticky', left: 0, zIndex: 3, background: '#F8F9FA' }}>日</th>
              <th style={{ minWidth: 24, position: 'sticky', left: 40, zIndex: 3, background: '#F8F9FA' }}>曜</th>
              {HOUR_COLUMNS.map(h => (
                <th key={h} style={{ minWidth: 26, fontSize: 10 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => {
              const dayNum = parseInt(d.date.split('/')[2]);
              const dowIdx = DOW_NAMES.indexOf(d.dayOfWeek);
              const isSun = dowIdx === 0 || d.isHoliday;
              const isSat = dowIdx === 6;
              const dowColor = isSun ? 'var(--danger)' : isSat ? 'var(--google-primary)' : '#333';

              // 休み判定
              const isLeave = d.status?.includes('有給') || d.status?.includes('代休') || d.status?.includes('振休') || d.status?.includes('欠勤');

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
                    left: 40,
                    background: 'white',
                    zIndex: 1,
                    fontSize: 11,
                  }}>
                    {d.dayOfWeek}
                  </td>
                  {HOUR_COLUMNS.map(h => {
                    const working = !isLeave && isWorking(d, h);
                    return (
                      <td
                        key={h}
                        style={{
                          backgroundColor: working ? getHourColor(h) : 'transparent',
                          minWidth: 26,
                          height: 18,
                        }}
                        title={working ? `${d.date} ${h}:00-${h + 1}:00` : ''}
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
