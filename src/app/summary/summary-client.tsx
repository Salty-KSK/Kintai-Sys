"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DailySummary, MonthlySummary } from "@/lib/summaryCalc";
import { FileDown } from "lucide-react";
import { updateRecordTime, deleteRecord, updateBreakTime, setDailyStatus, addRecord } from "@/app/actions";
import OvertimeHeatmap from "@/app/admin/overtime-heatmap";

type RecordItem = { id: string; type: string; timestamp: string; breakMinutes: number | null; note: string | null };

type Props = {
  dailySummaries: DailySummary[];
  monthlySummary: MonthlySummary;
  selectedUser: { id: string; name: string; employeeId: string; department: string };
  allUsers: { id: string; name: string }[];
  year: number;
  month: number;
  isAdmin: boolean;
  periodStr: string;
  records: Record<string, RecordItem[]>;
  canEdit: boolean;
  viewingUserId: string;
  sessionUserId: string;
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
  dailySummaries, monthlySummary, selectedUser, allUsers, year, month, isAdmin, periodStr,
  records, canEdit, viewingUserId, sessionUserId
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [editingCell, setEditingCell] = useState<{ date: string; field: 'clockIn' | 'clockOut' | 'break' | 'status' } | null>(null);
  const [editH, setEditH] = useState('');
  const [editM, setEditM] = useState('');
  const [editBreak, setEditBreak] = useState<string>('auto');
  const [editStatus, setEditStatus] = useState<string>('');
  const [editNote, setEditNote] = useState('');
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'summary' | 'overtime'>('summary');

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

  // --- 編集ヘルパー ---
  const parseTimeToHM = (timeStr: string | undefined): { h: number; m: number } => {
    if (!timeStr) return { h: 9, m: 0 };
    const parts = timeStr.split(':');
    return { h: parseInt(parts[0]) || 9, m: parseInt(parts[1]) || 0 };
  };

  const startClockEdit = (d: DailySummary, field: 'clockIn' | 'clockOut') => {
    if (!canEdit) return;
    const timeStr = field === 'clockIn' ? d.clockIn : d.clockOut;
    const { h, m } = parseTimeToHM(timeStr);
    setEditH(String(h));
    setEditM(String(m));
    setEditingCell({ date: d.date, field });
  };

  const startBreakEdit = (d: DailySummary) => {
    if (!canEdit) return;
    // 休憩レコード探索
    const dayRecords = records[d.date] || [];
    const breakRecord = dayRecords.find(r => r.type === 'BREAK_TIME');
    if (breakRecord && breakRecord.breakMinutes !== null) {
      setEditBreak(String(breakRecord.breakMinutes));
    } else {
      setEditBreak('auto');
    }
    setEditingCell({ date: d.date, field: 'break' });
  };

  const startStatusEdit = (d: DailySummary) => {
    if (!canEdit) return;
    const dayRecords = records[d.date] || [];
    const statusRecord = dayRecords.find(r => r.type.startsWith('STATUS_'));
    if (statusRecord) {
      setEditStatus(statusRecord.type);
      setEditNote(statusRecord.note || '');
    } else {
      setEditStatus('');
      setEditNote('');
    }
    setEditingCell({ date: d.date, field: 'status' });
  };

  const saveClockEdit = () => {
    if (!editingCell) return;
    const { date, field } = editingCell;
    const dayRecords = records[date] || [];
    const targetType = field === 'clockIn' ? 'CLOCK_IN' : 'CLOCK_OUT';
    const record = dayRecords.find(r => r.type === targetType);
    const hh = editH.padStart(2, '0');
    const mm = editM.padStart(2, '0');
    if (!record) {
      // レコードがない場合は新規追加
      startTransition(async () => {
        await addRecord(date, `${hh}:${mm}`, targetType, viewingUserId);
        setEditingCell(null);
        router.refresh();
      });
      return;
    }
    startTransition(async () => {
      await updateRecordTime(record.id, `${hh}:${mm}`);
      setEditingCell(null);
      router.refresh();
    });
  };

  const saveBreakEdit = () => {
    if (!editingCell) return;
    const { date } = editingCell;
    const minutes = editBreak === 'auto' ? null : parseInt(editBreak);
    startTransition(async () => {
      await updateBreakTime(date, minutes, viewingUserId);
      setEditingCell(null);
      router.refresh();
    });
  };

  const saveStatusEdit = () => {
    if (!editingCell) return;
    const { date } = editingCell;
    const statusType = editStatus || null;
    const note = editNote || null;
    startTransition(async () => {
      await setDailyStatus(date, statusType, note, viewingUserId);
      setEditingCell(null);
      router.refresh();
    });
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

      {/* ヘッダー: プルダウン(左) + 月切り替え(中央) + PDF(右)（no-print） */}
      <div className="card no-print" style={{ marginBottom: 16, padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 180 }}>
            {isAdmin ? (
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
            ) : (
              <span style={{ fontSize: 14, fontWeight: 500 }}>{selectedUser.name}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn-tonal" onClick={prevMonth} style={{ padding: "6px 14px", borderRadius: 20, minWidth: 0 }}>◀</button>
            <span style={{ fontSize: 16, fontWeight: 700, minWidth: 120, textAlign: "center" }}>
              {year}年{month}月
            </span>
            <button className="btn-tonal" onClick={nextMonth} style={{ padding: "6px 14px", borderRadius: 20, minWidth: 0 }}>▶</button>
          </div>
          <div style={{ minWidth: 180, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handlePrint}
              className="btn-tonal"
              style={{ padding: "6px 16px", borderRadius: 20, display: "flex", alignItems: "center", gap: 6 }}
              title="PDF保存 / 印刷"
            >
              <FileDown size={16} />
              <span style={{ fontSize: 13 }}>PDF保存</span>
            </button>
          </div>
        </div>
      </div>

      {/* タブバー */}
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`btn-tonal`}
          style={activeTab === 'summary' ? { backgroundColor: 'var(--google-active-pill)' } : { backgroundColor: 'transparent', color: 'var(--google-text-sub)' }}
          onClick={() => setActiveTab('summary')}
        >
          勤務集計
        </button>
        <button
          className={`btn-tonal`}
          style={activeTab === 'overtime' ? { backgroundColor: 'var(--google-active-pill)' } : { backgroundColor: 'transparent', color: 'var(--google-text-sub)' }}
          onClick={() => setActiveTab('overtime')}
        >
          残業管理
        </button>
      </div>

      {/* ===== 残業管理タブ ===== */}
      {activeTab === 'overtime' && (
        <OvertimeHeatmap overtimeData={{
          year,
          month,
          periodStr,
          employees: [{
            id: selectedUser.id,
            name: selectedUser.name,
            department: selectedUser.department || null,
            dailySummaries,
            monthlyOvertime: ms.weekdayOvertime + ms.weekdayNightOvertime,
            yearlyOvertime: 0,
          }],
        }} />
      )}

      {/* ===== 勤務集計タブ ===== */}
      {activeTab === 'summary' && (
      <div className="card" style={{ padding: "20px", overflow: "auto" }}>
        <div style={{ overflowX: "auto" }}>

          {/* 従業員情報 */}
          <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 0, marginBottom: 12 }}>
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

                const isEditingClockIn = editingCell?.date === d.date && editingCell.field === 'clockIn';
                const isEditingClockOut = editingCell?.date === d.date && editingCell.field === 'clockOut';
                const isEditingBreak = editingCell?.date === d.date && editingCell.field === 'break';
                const isEditingStatus = editingCell?.date === d.date && editingCell.field === 'status';

                return (
                  <tr key={i} className={rowClass}>
                    <td>{d.date.slice(5)}</td>
                    <td className={dowClass}>{d.dayOfWeek}</td>

                    {/* 出勤セル */}
                    <td
                      onClick={() => !isEditingClockIn && startClockEdit(d, 'clockIn')}
                      style={{ cursor: canEdit && !isEditingClockIn ? 'pointer' : 'default', position: 'relative' }}
                    >
                      {isEditingClockIn ? (
                        <div className="no-print" style={{display:'flex', gap:2, alignItems:'center'}}>
                          <select value={editH} onChange={e => setEditH(e.target.value)} style={{width:50, fontSize:11, padding:'2px'}}>
                            {Array.from({length:32}, (_, i) => i + 5).map(h => (
                              <option key={h} value={h}>{h >= 24 ? `翌${h-24}` : h}</option>
                            ))}
                          </select>:
                          <select value={editM} onChange={e => setEditM(e.target.value)} style={{width:45, fontSize:11, padding:'2px'}}>
                            {Array.from({length:60}, (_, i) => i).map(m => (
                              <option key={m} value={m}>{m.toString().padStart(2,'0')}</option>
                            ))}
                          </select>
                          <button onClick={saveClockEdit} disabled={isPending} style={{fontSize:18, cursor:'pointer', background:'none', border:'none', color:'#34A853', padding:'2px 6px'}}>✔</button>
                          <button onClick={() => setEditingCell(null)} style={{fontSize:18, cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px 6px'}}>✖</button>
                        </div>
                      ) : (
                        d.clockIn || (canEdit ? <span style={{color:'var(--google-border)', fontSize:13}}>＋</span> : null)
                      )}
                    </td>

                    {/* 退勤セル */}
                    <td
                      onClick={() => !isEditingClockOut && startClockEdit(d, 'clockOut')}
                      style={{ cursor: canEdit && !isEditingClockOut ? 'pointer' : 'default', position: 'relative' }}
                    >
                      {isEditingClockOut ? (
                        <div className="no-print" style={{display:'flex', gap:2, alignItems:'center'}}>
                          <select value={editH} onChange={e => setEditH(e.target.value)} style={{width:50, fontSize:11, padding:'2px'}}>
                            {Array.from({length:32}, (_, i) => i + 5).map(h => (
                              <option key={h} value={h}>{h >= 24 ? `翌${h-24}` : h}</option>
                            ))}
                          </select>:
                          <select value={editM} onChange={e => setEditM(e.target.value)} style={{width:45, fontSize:11, padding:'2px'}}>
                            {Array.from({length:60}, (_, i) => i).map(m => (
                              <option key={m} value={m}>{m.toString().padStart(2,'0')}</option>
                            ))}
                          </select>
                          <button onClick={saveClockEdit} disabled={isPending} style={{fontSize:18, cursor:'pointer', background:'none', border:'none', color:'#34A853', padding:'2px 6px'}}>✔</button>
                          <button onClick={() => setEditingCell(null)} style={{fontSize:18, cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px 6px'}}>✖</button>
                        </div>
                      ) : (
                        d.clockOut || (canEdit ? <span style={{color:'var(--google-border)', fontSize:13}}>＋</span> : null)
                      )}
                    </td>

                    {/* 休憩セル */}
                    <td
                      onClick={() => !isEditingBreak && startBreakEdit(d)}
                      style={{ cursor: canEdit && !isEditingBreak ? 'pointer' : 'default', position: 'relative' }}
                    >
                      {isEditingBreak ? (
                        <div className="no-print" style={{display:'flex', gap:2, alignItems:'center'}}>
                          <select value={editBreak} onChange={e => setEditBreak(e.target.value)} style={{width:55, fontSize:11, padding:'2px'}}>
                            <option value="auto">自動</option>
                            <option value="0">0分</option>
                            <option value="15">15分</option>
                            <option value="30">30分</option>
                            <option value="45">45分</option>
                            <option value="60">60分</option>
                            <option value="75">75分</option>
                            <option value="90">90分</option>
                          </select>
                          <button onClick={saveBreakEdit} disabled={isPending} style={{fontSize:18, cursor:'pointer', background:'none', border:'none', color:'#34A853', padding:'2px 6px'}}>✔</button>
                          <button onClick={() => setEditingCell(null)} style={{fontSize:18, cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px 6px'}}>✖</button>
                        </div>
                      ) : (
                        fmt(d.breakMinutes)
                      )}
                    </td>

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

                    {/* 備考（ステータス）セル */}
                    <td
                      onClick={() => !isEditingStatus && startStatusEdit(d)}
                      style={{
                        cursor: canEdit && !isEditingStatus ? 'pointer' : 'default',
                        color: isLeave ? "var(--google-primary)" : "var(--google-text-sub)",
                        fontWeight: isLeave ? 700 : 400,
                        fontSize: 11,
                        position: 'relative'
                      }}
                    >
                      {isEditingStatus ? (
                        <div className="no-print" style={{display:'flex', flexDirection:'column', gap:2, minWidth:100}}>
                          <select value={editStatus} onChange={e => { setEditStatus(e.target.value); if (!['STATUS_DAIKYU','STATUS_FURIKYU'].includes(e.target.value)) setEditNote(''); }} style={{fontSize:11, padding:'2px'}}>
                            <option value="">通常</option>
                            <option value="STATUS_DAIKYU">代休</option>
                            <option value="STATUS_FURIKYU">振休</option>
                            <option value="STATUS_YUKYU">有給</option>
                            <option value="STATUS_KEKKIN">欠勤</option>
                          </select>
                          {(editStatus === 'STATUS_DAIKYU' || editStatus === 'STATUS_FURIKYU') && (
                            <input
                              type="text"
                              placeholder="対象日"
                              value={editNote}
                              onChange={e => setEditNote(e.target.value)}
                              style={{fontSize:11, padding:'2px 4px', width:'100%', border:'1px solid var(--google-border)', borderRadius:4}}
                            />
                          )}
                          <div style={{display:'flex', gap:2}}>
                            <button onClick={saveStatusEdit} disabled={isPending} style={{fontSize:18, cursor:'pointer', background:'none', border:'none', color:'#34A853', padding:'2px 6px'}}>✔</button>
                            <button onClick={() => setEditingCell(null)} style={{fontSize:18, cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px 6px'}}>✖</button>
                          </div>
                        </div>
                      ) : (
                        isLeave ? d.status : (d.status === "退勤済" ? "退勤済" : "")
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

        </div>
      </div>
      )}
    </div>
  );
}
