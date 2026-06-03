"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DailySummary, MonthlySummary } from "@/lib/summaryCalc";
import { FileDown } from "lucide-react";

type Props = {
  dailySummaries: DailySummary[];
  monthlySummary: MonthlySummary;
  selectedUser: { id: string; name: string; employeeId: string; department: string };
  allUsers: { id: string; name: string }[];
  year: number;
  month: number;
  isAdmin: boolean;
};

function fmt(min: number): string {
  if (!min || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function fmtTotal(min: number): string {
  if (min <= 0) return "0:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export default function SummaryClient({
  dailySummaries, monthlySummary, selectedUser, allUsers, year, month, isAdmin
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const navigate = (userId?: string, y?: number, m?: number) => {
    setLoading(true);
    const u = userId || selectedUser.id;
    const yr = y || year;
    const mo = m || month;
    router.push(`/summary?user=${u}&year=${yr}&month=${mo}`);
    setTimeout(() => setLoading(false), 500);
  };

  const prevMonth = () => {
    const m2 = month === 1 ? 12 : month - 1;
    const y2 = month === 1 ? year - 1 : year;
    navigate(undefined, y2, m2);
  };
  const nextMonth = () => {
    const m2 = month === 12 ? 1 : month + 1;
    const y2 = month === 12 ? year + 1 : year;
    navigate(undefined, y2, m2);
  };

  const handlePrint = () => {
    window.print();
  };

  const ms = monthlySummary;

  return (
    <div className="container animate-fade-in" style={{ maxWidth: "100%", padding: "16px" }}>
      {loading && <div className="loading-overlay"><div className="loading-spinner" /></div>}

      {/* 印刷用ヘッダー（画面では非表示） */}
      <div className="print-header">
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>勤務集計表</h1>
        <div style={{ fontSize: 13, color: "#5F6368", display: "flex", gap: 24 }}>
          <span>{selectedUser.name}{selectedUser.department ? ` （${selectedUser.department}）` : ""}</span>
          <span>{year}年{month}月</span>
          {selectedUser.employeeId && <span>社員番号: {selectedUser.employeeId}</span>}
        </div>
      </div>

      {/* ヘッダー: 従業員選択 + 月切り替え */}
      <div className="card no-print" style={{ marginBottom: 16, padding: "16px 20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {isAdmin && (
              <select
                className="form-select"
                value={selectedUser.id}
                onChange={(e) => navigate(e.target.value)}
                style={{ minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--google-border)", fontSize: 14 }}
              >
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {selectedUser.name}
              {selectedUser.department && (
                <span style={{ fontSize: 12, color: "var(--google-text-sub)", marginLeft: 8 }}>
                  {selectedUser.department}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn-tonal" onClick={prevMonth} style={{ padding: "6px 14px", borderRadius: 20, minWidth: 0 }}>◀</button>
            <span style={{ fontSize: 16, fontWeight: 700, minWidth: 120, textAlign: "center" }}>
              {year}年{month}月
            </span>
            <button className="btn-tonal" onClick={nextMonth} style={{ padding: "6px 14px", borderRadius: 20, minWidth: 0 }}>▶</button>
            <button
              onClick={handlePrint}
              className="btn-tonal"
              style={{ padding: "6px 16px", borderRadius: 20, display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}
              title="PDF保存 / 印刷"
            >
              <FileDown size={16} />
              <span style={{ fontSize: 13 }}>PDF保存</span>
            </button>
          </div>
        </div>
      </div>

      {/* 月別サマリー */}
      <div className="card" style={{ marginBottom: 16, padding: "16px 20px" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--google-primary)" }}>月別データ（時間集計）</h3>
        <table className="data-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th></th><th></th><th>所定時間</th><th>残業（8h超）</th><th>深夜所定</th><th>深夜残業</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td rowSpan={1} style={{ fontWeight: 700 }}>平日</td>
              <td></td>
              <td style={{ fontWeight: 700 }}>{fmtTotal(ms.weekdayRegular)}</td>
              <td style={{ color: ms.weekdayOvertime > 0 ? "var(--danger)" : "inherit", fontWeight: ms.weekdayOvertime > 0 ? 700 : 400 }}>{fmtTotal(ms.weekdayOvertime)}</td>
              <td>{fmtTotal(ms.weekdayNightRegular)}</td>
              <td>{fmtTotal(ms.weekdayNightOvertime)}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>休日</td>
              <td>法定外</td>
              <td>{fmtTotal(ms.satHoliday)}</td>
              <td>{fmtTotal(ms.satHolidayOvertime)}</td>
              <td colSpan={2}>{fmtTotal(ms.satNight)}</td>
            </tr>
            <tr>
              <td></td>
              <td>法定</td>
              <td>{fmtTotal(ms.sunHoliday)}</td>
              <td>{fmtTotal(ms.sunHolidayOvertime)}</td>
              <td colSpan={2}>{fmtTotal(ms.sunNight)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 日数集計 */}
      <div className="card" style={{ marginBottom: 16, padding: "16px 20px" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--google-primary)" }}>月別データ（日数集計）</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { label: "出勤日数", value: ms.workDays, color: "var(--google-primary)" },
            { label: "休日出勤", value: ms.holidayWorkDays, color: "#E37400" },
            { label: "有給", value: ms.yukyuDays, color: "#34A853" },
            { label: "代休", value: ms.daikyuDays, color: "#4285F4" },
            { label: "振替休日", value: ms.furikyuDays, color: "#9334E6" },
            { label: "欠勤", value: ms.kekkinDays, color: "var(--danger)" },
          ].map(item => (
            <div key={item.label} style={{ textAlign: "center", minWidth: 70, padding: "8px 12px", background: "var(--google-bg)", borderRadius: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 11, color: "var(--google-text-sub)" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 日別テーブル */}
      <div className="card" style={{ padding: "16px 20px", overflow: "auto" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--google-primary)" }}>日別データ（勤怠集計）</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                <th>日付</th><th>曜日</th>
                <th>出勤</th><th>退勤</th><th>休憩</th>
                <th>所定</th><th>残業</th>
                <th>深夜所定</th><th>深夜残業</th>
                <th>法定外(土)</th><th>法定外深夜</th>
                <th>法定(日)</th><th>法定深夜</th>
                <th>備考</th>
              </tr>
            </thead>
            <tbody>
              {dailySummaries.map((d, i) => {
                const isSat = d.dayOfWeek === "土";
                const isSun = d.dayOfWeek === "日";
                const isLeave = !!d.leaveType;
                const rowBg = isSun ? "#FEF0F0" : isSat ? "#F0F4FE" : d.isHoliday ? "#FEF0F0" : undefined;

                return (
                  <tr key={i} style={{ background: rowBg }}>
                    <td>{d.date.slice(5)}</td>
                    <td style={{
                      fontWeight: 700,
                      color: isSun || d.isHoliday ? "var(--danger)" : isSat ? "var(--google-primary)" : "inherit"
                    }}>{d.dayOfWeek}</td>
                    <td>{d.clockIn}</td>
                    <td>{d.clockOut}</td>
                    <td>{fmt(d.breakMinutes)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(d.regularMinutes)}</td>
                    <td style={{ color: d.overtimeMinutes > 0 ? "var(--danger)" : "inherit", fontWeight: d.overtimeMinutes > 0 ? 700 : 400 }}>
                      {fmt(d.overtimeMinutes)}
                    </td>
                    <td>{fmt(d.nightRegularMin)}</td>
                    <td>{fmt(d.nightOvertimeMin)}</td>
                    <td>{fmt(d.holidaySatMin)}</td>
                    <td>{fmt(d.holidaySatNightMin)}</td>
                    <td>{fmt(d.holidaySunMin)}</td>
                    <td>{fmt(d.holidaySunNightMin)}</td>
                    <td style={{
                      color: isLeave ? "var(--google-primary)" : "var(--google-text-sub)",
                      fontWeight: isLeave ? 700 : 400,
                      fontSize: 11
                    }}>{d.status !== "退勤済" ? d.status : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
