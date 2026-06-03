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
  periodStr: string;
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
  dailySummaries, monthlySummary, selectedUser, allUsers, year, month, isAdmin, periodStr
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
          <span>{periodStr}</span>
          {selectedUser.employeeId && <span>社員番号: {selectedUser.employeeId}</span>}
        </div>
      </div>

      {/* 従業員選択（管理者のみ） */}
      {isAdmin && (
        <div className="card no-print" style={{ marginBottom: 12, padding: "12px 20px" }}>
          <select
            className="form-select"
            value={selectedUser.id}
            onChange={(e) => navigate(e.target.value)}
            style={{ minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--google-border)", fontSize: 14 }}
          >
            {allUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ヘッダー: 従業員情報 + 月切り替え（no-print） */}
      <div className="card no-print" style={{ marginBottom: 16, padding: "16px 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 0 }}>
            <span>{selectedUser.name}</span>
            <span style={{ color: "var(--google-border)", margin: "0 10px", fontWeight: 300 }}>｜</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--google-text-sub)" }}>
              {selectedUser.employeeId || '—'}
            </span>
            <span style={{ color: "var(--google-border)", margin: "0 10px", fontWeight: 300 }}>｜</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--google-text-sub)" }}>
              {selectedUser.department || '—'}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
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

      {/* 帳票本体 */}
      <div className="card" style={{ padding: "20px", overflow: "auto" }}>
        <div style={{ overflowX: "auto" }}>

          {/* 上段: 勤怠情報(左) + 日数集計(左下) ＋ 時間集計(右) の横並び */}
          <div style={{ display: "flex", gap: 32, marginBottom: 16, flexWrap: "wrap" }}>

            {/* 左カラム: 勤怠情報 + 日数集計 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* 勤怠情報 */}
              <table className="report-table">
                <tbody>
                  <tr><td colSpan={6} className="section-header">勤怠情報</td></tr>
                  <tr>
                    <td className="label-cell">年月</td>
                    <td className="label-cell" colSpan={5}>期間</td>
                  </tr>
                  <tr>
                    <td className="value-cell">{year}年{month}月</td>
                    <td className="value-cell" colSpan={5}>{periodStr}</td>
                  </tr>
                </tbody>
              </table>

              {/* 日数集計 */}
              <table className="report-table">
                <tbody>
                  <tr><td colSpan={6} className="section-header">月別データ（日数集計）</td></tr>
                  <tr>
                    <td className="col-header">出勤日数</td>
                    <td className="col-header">休日出勤</td>
                    <td className="col-header">有給</td>
                    <td className="col-header">代休</td>
                    <td className="col-header">振休</td>
                    <td className="col-header">欠勤</td>
                  </tr>
                  <tr>
                    <td className="num-cell">{ms.workDays}</td>
                    <td className="num-cell">{ms.holidayWorkDays}</td>
                    <td className="num-cell">{ms.yukyuDays}</td>
                    <td className="num-cell">{ms.daikyuDays}</td>
                    <td className="num-cell">{ms.furikyuDays}</td>
                    <td className="num-cell">{ms.kekkinDays}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 右カラム: 時間集計 */}
            <div>
              <table className="report-table">
                <tbody>
                  <tr><td colSpan={6} className="section-header">月別データ（時間集計）</td></tr>
                  <tr>
                    <td></td><td></td>
                    <td className="col-header">所定時間</td>
                    <td className="col-header">残業（8h超）</td>
                    <td className="col-header">深夜所定</td>
                    <td className="col-header">深夜残業</td>
                  </tr>
                  <tr>
                    <td></td><td style={{fontWeight:700}}>平日</td>
                    <td className="num-cell">{fmtTotal(ms.weekdayRegular)}</td>
                    <td className="num-cell overtime">{fmtTotal(ms.weekdayOvertime)}</td>
                    <td className="num-cell">{fmtTotal(ms.weekdayNightRegular)}</td>
                    <td className="num-cell">{fmtTotal(ms.weekdayNightOvertime)}</td>
                  </tr>
                  <tr>
                    <td style={{fontWeight:700}} rowSpan={2}>休日</td>
                    <td>法定外</td>
                    <td className="num-cell">{fmtTotal(ms.satHoliday)}</td>
                    <td className="num-cell">{fmtTotal(ms.satHolidayOvertime)}</td>
                    <td className="num-cell" colSpan={2}>{fmtTotal(ms.satNight)}</td>
                  </tr>
                  <tr>
                    <td>法定</td>
                    <td className="num-cell">{fmtTotal(ms.sunHoliday)}</td>
                    <td className="num-cell">{fmtTotal(ms.sunHolidayOvertime)}</td>
                    <td className="num-cell" colSpan={2}>{fmtTotal(ms.sunNight)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>

          {/* セクション5: 日別データ（勤怠集計） */}
          <table className="report-table">
            <tbody>
              <tr><td colSpan={15} className="section-header">日別データ（勤怠集計）</td></tr>
              <tr className="col-header-row">
                <td className="col-header">日付</td>
                <td className="col-header">曜日/祝</td>
                <td className="col-header">出勤</td>
                <td className="col-header">退勤</td>
                <td className="col-header">休憩</td>
                <td className="col-header">所定</td>
                <td className="col-header">残業（8h超）</td>
                <td className="col-header">深夜所定</td>
                <td className="col-header">深夜残業</td>
                <td className="col-header">法定外休日(土曜)</td>
                <td className="col-header">法定外休日深夜</td>
                <td className="col-header">法定休日(日曜)</td>
                <td className="col-header">法定休日深夜</td>
                <td className="col-header">深夜労働合計</td>
                <td className="col-header">備考</td>
              </tr>
              {dailySummaries.map((d, i) => {
                const isSat = d.dayOfWeek === "土";
                const isSun = d.dayOfWeek === "日";
                const isHoliday = d.isHoliday;
                const isLeave = !!d.leaveType;

                const rowClass = isSun ? "day-row-sun"
                  : isHoliday ? "day-row-holiday"
                  : isSat ? "day-row-sat"
                  : "";

                const dowClass = (isSun || isHoliday) ? "dow-sun"
                  : isSat ? "dow-sat"
                  : "";

                const hasOvertime = d.overtimeMinutes > 0;

                return (
                  <tr key={i} className={rowClass}>
                    <td>{d.date.slice(5)}</td>
                    <td className={dowClass}>{d.dayOfWeek}</td>
                    <td>{d.clockIn}</td>
                    <td>{d.clockOut}</td>
                    <td>{fmt(d.breakMinutes)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(d.regularMinutes)}</td>
                    <td style={{
                      color: hasOvertime ? "var(--danger)" : "inherit",
                      fontWeight: hasOvertime ? 700 : 400
                    }}>
                      {fmt(d.overtimeMinutes)}
                    </td>
                    <td>{fmt(d.nightRegularMin)}</td>
                    <td>{fmt(d.nightOvertimeMin)}</td>
                    <td>{fmt(d.holidaySatMin)}</td>
                    <td>{fmt(d.holidaySatNightMin)}</td>
                    <td>{fmt(d.holidaySunMin)}</td>
                    <td>{fmt(d.holidaySunNightMin)}</td>
                    <td>{fmt(d.totalNightMin)}</td>
                    <td style={{
                      color: isLeave ? "var(--google-primary)" : "var(--google-text-sub)",
                      fontWeight: isLeave ? 700 : 400,
                      fontSize: 11
                    }}>
                      {isLeave ? d.status : (d.status === "退勤済" ? "退勤済" : "")}
                    </td>
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
