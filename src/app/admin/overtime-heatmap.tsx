"use client";

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

function getCellColor(d: DailySummary): string {
  // 法定休日+深夜
  if (d.holidaySunNightMin > 0) return '#FFE082'; // ×1.6
  // 法定休日
  if (d.holidaySunMin > 0) return '#FFAB91'; // ×1.35
  // 法定外休日+深夜
  if (d.holidaySatNightMin > 0) return '#FFCDD2'; // ×1.5
  // 法定外休日
  if (d.holidaySatMin > 0) return '#FFE0B2'; // ×1.25 (休日)
  // 深夜残業
  if (d.nightOvertimeMin > 0) return '#FFF3CD'; // ×1.25 (深夜)
  // 通常残業
  if (d.overtimeMinutes > 0) return '#FFE0B2'; // ×1.25
  // 所定労働
  if (d.regularMinutes > 0) return '#C8E6FF'; // ×1.0
  return 'transparent';
}

function getCellValue(d: DailySummary): string {
  const overtime = d.overtimeMinutes + d.holidaySatMin + d.holidaySatNightMin + d.holidaySunMin + d.holidaySunNightMin + d.nightOvertimeMin;
  if (overtime <= 0) return '';
  const h = Math.floor(overtime / 60);
  const m = overtime % 60;
  if (h > 0 && m > 0) return `${h}:${m.toString().padStart(2, '0')}`;
  if (h > 0) return `${h}`;
  return `${m}`;
}

const DOW_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const LEGEND_ITEMS = [
  { color: '#C8E6FF', label: '所定労働（割増なし）' },
  { color: '#FFE0B2', label: '法定時間外（×1.25）' },
  { color: '#FFF3CD', label: '深夜労働（×1.25）' },
  { color: '#FFCDD2', label: '法定外休日+深夜（×1.5）' },
  { color: '#FFAB91', label: '法定休日（×1.35）' },
  { color: '#FFE082', label: '法定休日+深夜（×1.6）' },
];

export default function OvertimeHeatmap({ overtimeData }: Props) {
  const { periodStr, employees } = overtimeData;

  // 日付リストを最初の従業員のdailySummariesから取得
  const dates = employees.length > 0 ? employees[0].dailySummaries : [];

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
        ⚠ 時間外労働の上限: 月 45時間・年 360時間
      </div>

      {/* 期間表示 */}
      <div style={{ fontSize: 13, color: 'var(--google-text-sub)', marginBottom: 12, fontWeight: 500 }}>
        期間: {periodStr}
      </div>

      {/* テーブル */}
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <table className="heatmap-table">
          <thead>
            {/* 日付行 */}
            <tr>
              <th style={{ minWidth: 80, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, background: '#F8F9FA' }}>
                社員名
              </th>
              {dates.map((d, i) => {
                const day = parseInt(d.date.split('/')[2]);
                return (
                  <th key={i}>
                    {day}
                  </th>
                );
              })}
              <th style={{ minWidth: 60 }}>月合計</th>
              <th style={{ minWidth: 60 }}>年累計</th>
            </tr>
            {/* 曜日行 */}
            <tr>
              <th style={{ textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, background: '#F8F9FA' }}></th>
              {dates.map((d, i) => {
                const dow = DOW_NAMES.indexOf(d.dayOfWeek);
                let color = '#5F6368';
                if (dow === 6) color = 'var(--google-primary)'; // 土曜
                if (dow === 0 || d.isHoliday) color = 'var(--danger)'; // 日曜・祝日
                return (
                  <th key={i} style={{ color, fontWeight: 700 }}>
                    {d.dayOfWeek}
                  </th>
                );
              })}
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const monthlyExceed = emp.monthlyOvertime > 45 * 60;
              const yearlyExceed = emp.yearlyOvertime > 360 * 60;

              return (
                <tr key={emp.id}>
                  <td className="employee-name">{emp.name}</td>
                  {emp.dailySummaries.map((d, i) => (
                    <td
                      key={i}
                      style={{
                        backgroundColor: getCellColor(d),
                        fontSize: 10,
                        padding: '3px 1px',
                      }}
                      title={`${d.date} ${d.dayOfWeek} - 残業: ${fmtMin(d.overtimeMinutes)}`}
                    >
                      {getCellValue(d)}
                    </td>
                  ))}
                  <td
                    className={`total-cell ${monthlyExceed ? 'overtime-warning' : ''}`}
                  >
                    {monthlyExceed && '⚠ '}
                    {fmtMin(emp.monthlyOvertime)}
                  </td>
                  <td
                    className={`total-cell ${yearlyExceed ? 'overtime-warning' : ''}`}
                  >
                    {yearlyExceed && '⚠ '}
                    {fmtMin(emp.yearlyOvertime)}
                  </td>
                </tr>
              );
            })}

            {employees.length === 0 && (
              <tr>
                <td
                  colSpan={dates.length + 3}
                  className="text-center text-muted"
                  style={{ padding: '24px 0' }}
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
