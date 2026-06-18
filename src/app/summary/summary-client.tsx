"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import type { DailySummary, MonthlySummary, DayType } from "@/lib/summaryCalc";
import { calculateDailySummary, calculateMonthlySummary, generateDateRange } from "@/lib/summaryCalc";
import { FileDown, Check, X, Trash2 } from "lucide-react";
import { updateRecordTime, deleteRecord, updateBreakTime, setDailyStatus, addRecord, setDayTypeOverride, setFurikyuWithOverride } from "@/app/actions";
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
  dayTypeOverrides: Record<string, { dayType: string; reason: string }>;
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
  dailySummaries: initialDailySummaries, monthlySummary: initialMonthlySummary, selectedUser, allUsers, year, month, isAdmin, periodStr,
  records: initialRecords, canEdit, viewingUserId, sessionUserId, dayTypeOverrides
}: Props) {
  const router = useRouter();
  const [editingCell, setEditingCell] = useState<{ date: string; field: 'clockIn' | 'clockOut' | 'break' | 'status' | 'dayType' } | null>(null);
  const [editH, setEditH] = useState('');
  const [editM, setEditM] = useState('');
  const [editBreak, setEditBreak] = useState<string>('auto');
  const [editStatus, setEditStatus] = useState<string>('');
  const [editDayType, setEditDayType] = useState<string>('');
  const [editNote, setEditNote] = useState('');
  const [furikyuStep, setFurikyuStep] = useState<'select' | 'daikyu' | null>(null);
  const [furikyuDate, setFurikyuDate] = useState('');
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'summary' | 'overtime'>('summary');

  // ===== ローカルstate: サーバーを待たず即座に再計算 =====
  const [localRecords, setLocalRecords] = useState(initialRecords);
  const [localDayTypeOverrides, setLocalDayTypeOverrides] = useState(dayTypeOverrides);
  const [dailySummaries, setDailySummaries] = useState(initialDailySummaries);
  const [monthlySummary, setMonthlySummary] = useState(initialMonthlySummary);

  // サーバーからpropsが更新されたら同期
  useEffect(() => {
    setLocalRecords(initialRecords);
    setLocalDayTypeOverrides(dayTypeOverrides);
    setDailySummaries(initialDailySummaries);
    setMonthlySummary(initialMonthlySummary);
  }, [initialRecords, dayTypeOverrides, initialDailySummaries, initialMonthlySummary]);

  // クライアント側で即座に集計を再計算する関数（サーバーのpage.tsxと同一ロジック）
  const recalcSummaries = (updatedRecords: Record<string, RecordItem[]>, updatedOverrides?: Record<string, { dayType: string; reason: string }>) => {
    const currentOverrides = updatedOverrides || localDayTypeOverrides;
    if (updatedOverrides) {
      setLocalDayTypeOverrides(updatedOverrides);
    }

    const dates = generateDateRange(year, month);
    // 祝日リストをinitialDailySummariesから取得
    const holidayDates = initialDailySummaries
      .filter(d => d.isHoliday)
      .map(d => {
        const parts = d.date.split('/').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
      });

    // 全レコードをフラットに展開（サーバーと同じく日付横断で割り当て）
    const allRecords: (RecordItem & { _dateKey: string })[] = [];
    for (const [dateKey, recs] of Object.entries(updatedRecords)) {
      for (const r of recs) {
        allRecords.push({ ...r, _dateKey: dateKey });
      }
    }

    const assignedIds = new Set<string>();
    const newDailySummaries = dates.map(date => {
      const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
      const dateStr = `${y}/${(m+1).toString().padStart(2,'0')}/${d.toString().padStart(2,'0')}`;

      // サーバーと同じ: 05:00 JST 〜 翌04:59 JST (厳密範囲) + 翌12:59 JST (CLOCK_OUT拡張)
      const dayStart = new Date(Date.UTC(y, m, d, 5 - 9, 0, 0, 0));
      const strictEnd = new Date(Date.UTC(y, m, d + 1, 4 - 9, 59, 59, 999));
      const extendEnd = new Date(Date.UTC(y, m, d + 1, 12 - 9, 59, 59, 999));

      const dayRecords = allRecords.filter(r => {
        if (assignedIds.has(r.id)) return false;
        const t = new Date(r.timestamp);
        if (t < dayStart) return false;
        if (t <= strictEnd) return true;
        if (t <= extendEnd && r.type === 'CLOCK_OUT') return true;
        return false;
      });
      dayRecords.forEach(r => assignedIds.add(r.id));

      const recordsForCalc = dayRecords.map(r => ({
        type: r.type,
        timestamp: new Date(r.timestamp),
        breakMinutes: r.breakMinutes,
        note: r.note,
      }));

      // 当日のオーバーライド
      const override = currentOverrides[dateStr];

      // 翌暦日のdayTypeを計算（サーバーと同一ロジック）
      const nextCalDate = new Date(y, m, d + 1);
      const nextDow = nextCalDate.getDay();
      let nextDayType: DayType = "weekday";
      if (nextDow === 0) nextDayType = "sunday";
      else if (nextDow === 6) nextDayType = "saturday";
      const nextIsHoliday = holidayDates.some(h =>
        h.getFullYear() === nextCalDate.getFullYear() &&
        h.getMonth() === nextCalDate.getMonth() &&
        h.getDate() === nextCalDate.getDate()
      );
      if (nextIsHoliday && nextDayType === "weekday") nextDayType = "holiday";
      const nextDateStr = `${nextCalDate.getFullYear()}/${(nextCalDate.getMonth()+1).toString().padStart(2,'0')}/${nextCalDate.getDate().toString().padStart(2,'0')}`;
      const nextOverride = currentOverrides[nextDateStr];
      if (nextOverride) nextDayType = nextOverride.dayType as DayType;

      return calculateDailySummary(date, recordsForCalc, holidayDates, (override?.dayType as DayType) || null, nextDayType);
    });

    const newMonthlySummary = calculateMonthlySummary(newDailySummaries);
    setDailySummaries(newDailySummaries);
    setMonthlySummary(newMonthlySummary);
    setLocalRecords(updatedRecords);
  };

  const navigate = (userId?: string, y?: number, m?: number) => {
    const u = userId || selectedUser.id;
    const yr = y || year;
    const mo = m || month;
    startTransition(() => {
      router.push(`/summary?user=${u}&year=${yr}&month=${mo}`);
    });
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
  const handleMonthSelect = (value: string) => {
    // value: "YYYY-MM"
    const [y, m] = value.split('-').map(Number);
    if (y && m) navigate(undefined, y, m);
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
    const dayRecords = localRecords[d.date] || [];
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
    const dayRecords = localRecords[d.date] || [];
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
    const dayRecords = localRecords[date] || [];
    const targetType = field === 'clockIn' ? 'CLOCK_IN' : 'CLOCK_OUT';
    const record = dayRecords.find(r => r.type === targetType);
    const hh = editH.padStart(2, '0');
    const mm = editM.padStart(2, '0');

    // クライアント側で即座にレコードを更新して再計算
    // JST時刻をUTCに直接変換: Date.UTC(y, m, d, hour - 9, minute)
    const parts = date.split('/').map(Number);
    const hourNum = parseInt(hh);
    const minNum = parseInt(mm);
    const newTimestamp = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], hourNum - 9, minNum, 0, 0)).toISOString();

    let updatedDayRecords: RecordItem[];
    if (record) {
      updatedDayRecords = dayRecords.map(r => r.id === record.id ? { ...r, timestamp: newTimestamp } : r);
    } else {
      updatedDayRecords = [...dayRecords, { id: `temp-${Date.now()}`, type: targetType, timestamp: newTimestamp, breakMinutes: null, note: null }];
    }
    const updatedRecords = { ...localRecords, [date]: updatedDayRecords };
    recalcSummaries(updatedRecords);
    setEditingCell(null);

    // サーバー同期はバックグラウンド（UIをブロックしない）
    (async () => {
      if (!record) {
        await addRecord(date, `${hh}:${mm}`, targetType, viewingUserId);
      } else {
        await updateRecordTime(record.id, `${hh}:${mm}`, date);
      }
      router.refresh();
    })();
  };

  const deleteClockRecord = () => {
    if (!editingCell) return;
    const { date, field } = editingCell;
    const dayRecords = localRecords[date] || [];
    const targetType = field === 'clockIn' ? 'CLOCK_IN' : 'CLOCK_OUT';
    const record = dayRecords.find(r => r.type === targetType);
    if (!record) { setEditingCell(null); return; }

    // クライアント側で即座にレコードを削除して再計算
    const updatedRecords = { ...localRecords, [date]: dayRecords.filter(r => r.id !== record.id) };
    recalcSummaries(updatedRecords);
    setEditingCell(null);

    // サーバー同期はバックグラウンド
    (async () => {
      await deleteRecord(record.id);
      router.refresh();
    })();
  };

  const deleteDayRecords = (date: string) => {
    const dayRecords = localRecords[date] || [];
    if (dayRecords.length === 0) return;
    if (!confirm(`${date.slice(5)} のデータを全て削除しますか？`)) return;

    // クライアント側で即座に全レコードを削除して再計算
    const updatedRecords = { ...localRecords, [date]: [] };
    recalcSummaries(updatedRecords);

    // サーバー同期はバックグラウンド
    (async () => {
      for (const r of dayRecords) {
        await deleteRecord(r.id);
      }
      router.refresh();
    })();
  };

  const saveBreakEdit = () => {
    if (!editingCell) return;
    const { date } = editingCell;
    const minutes = editBreak === 'auto' ? null : parseInt(editBreak);

    // クライアント側で即座に休憩レコードを更新して再計算
    const dayRecords = localRecords[date] || [];
    const breakRecord = dayRecords.find(r => r.type === 'BREAK_TIME');
    let updatedDayRecords: RecordItem[];
    if (breakRecord) {
      updatedDayRecords = dayRecords.map(r => r.id === breakRecord.id ? { ...r, breakMinutes: minutes } : r);
    } else if (minutes !== null) {
      updatedDayRecords = [...dayRecords, { id: `temp-break-${Date.now()}`, type: 'BREAK_TIME', timestamp: new Date().toISOString(), breakMinutes: minutes, note: null }];
    } else {
      updatedDayRecords = dayRecords.filter(r => r.type !== 'BREAK_TIME');
    }
    const updatedRecords = { ...localRecords, [date]: updatedDayRecords };
    recalcSummaries(updatedRecords);
    setEditingCell(null);

    // サーバー同期はバックグラウンド
    (async () => {
      await updateBreakTime(date, minutes, viewingUserId);
      router.refresh();
    })();
  };

  const saveStatusEdit = () => {
    if (!editingCell) return;
    const { date } = editingCell;
    if (editStatus === 'STATUS_FURIKYU' && furikyuStep === null) {
      setFurikyuDate(date);
      setFurikyuStep('select');
      return;
    }
    if (editStatus === 'STATUS_DAIKYU' && furikyuStep === null) {
      setFurikyuDate(date);
      setFurikyuStep('daikyu');
      return;
    }
    const statusType = editStatus || null;
    const note = editNote || null;

    // クライアント側で即座にステータスレコードを更新して再計算
    const dayRecords = localRecords[date] || [];
    let updatedOverrides: Record<string, { dayType: string; reason: string }> | undefined;

    // ステータスクリア時: 関連するDayTypeOverrideを全て除去
    if (!statusType) {
      updatedOverrides = { ...localDayTypeOverrides };
      // 当日のオーバーライドを削除
      delete updatedOverrides[date];

      // 既存の振休レコードがある場合、ペアの振替出勤日のオーバーライドも除去
      const existingFurikyu = dayRecords.find(r => r.type === 'STATUS_FURIKYU');
      if (existingFurikyu && existingFurikyu.note) {
        const match = existingFurikyu.note.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (match) {
          const [, oy, om, od] = match;
          const pairedDateStr = `${oy}/${om.padStart(2, '0')}/${od.padStart(2, '0')}`;
          delete updatedOverrides[pairedDateStr];
        }
      }

      // 当日を参照するオーバーライドも除去（孤立オーバーライド対策）
      for (const [key, ov] of Object.entries(updatedOverrides)) {
        if (ov.reason && ov.reason.includes(date)) {
          delete updatedOverrides[key];
        }
      }
    }

    let updatedDayRecords: RecordItem[];
    if (statusType) {
      // ステータスを設定: 既存STATUS_*を置換 or 追加
      const existing = dayRecords.find(r => r.type.startsWith('STATUS_'));
      if (existing) {
        updatedDayRecords = dayRecords.map(r => r.id === existing.id ? { ...r, type: statusType, note } : r);
      } else {
        updatedDayRecords = [...dayRecords, { id: `temp-status-${Date.now()}`, type: statusType, timestamp: new Date().toISOString(), breakMinutes: null, note }];
      }
    } else {
      // ステータスを削除: STATUS_*レコードを全て除去
      updatedDayRecords = dayRecords.filter(r => !r.type.startsWith('STATUS_'));
    }
    const updatedRecords = { ...localRecords, [date]: updatedDayRecords };
    recalcSummaries(updatedRecords, updatedOverrides);
    setEditingCell(null);

    (async () => {
      await setDailyStatus(date, statusType, note, viewingUserId);
      router.refresh();
    })();
  };

  // 振替出勤日を選択して確定
  const confirmFurikyu = (workDate: string) => {
    setFurikyuStep(null);
    setFurikyuDate('');
    setEditingCell(null);
    (async () => {
      await setFurikyuWithOverride(furikyuDate, workDate, viewingUserId);
      router.refresh();
    })();
  };

  // 代休の対象日を選択して確定
  const confirmDaikyu = (targetDate: string) => {
    setFurikyuStep(null);
    setFurikyuDate('');
    setEditingCell(null);
    (async () => {
      await setDailyStatus(furikyuDate, 'STATUS_DAIKYU', targetDate, viewingUserId);
      router.refresh();
    })();
  };

  // 期間内の土曜日・日曜日・祝日を取得（振替出勤日の候補）
  const furikyuCandidates = dailySummaries.filter(d =>
    (d.dayType === 'saturday' || d.dayType === 'sunday' || d.dayType === 'holiday') && d.date !== furikyuDate
  );

  // 代休の候補: 休日出勤した日（土曜・日曜・祝日でレコードがある日）
  const daikyuCandidates = dailySummaries.filter(d =>
    (d.dayType === 'saturday' || d.dayType === 'sunday' || d.dayType === 'holiday') &&
    d.clockIn && d.date !== furikyuDate
  );

  const startDayTypeEdit = (d: DailySummary) => {
    if (!canEdit) return;
    const override = localDayTypeOverrides[d.date];
    setEditDayType(override?.dayType || '');
    setEditingCell({ date: d.date, field: 'dayType' });
  };

  const saveDayTypeEdit = () => {
    if (!editingCell) return;
    const { date } = editingCell;
    const newDayType = editDayType || null;
    setEditingCell(null);
    (async () => {
      await setDayTypeOverride(date, newDayType, undefined, viewingUserId);
      router.refresh();
    })();
  };

  const ms = monthlySummary;

  return (
    <div className="container animate-fade-in" style={{ maxWidth: "100%", padding: "16px" }}>
      {isPending && <div className="loading-overlay"><div className="loading-spinner" /></div>}

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
                style={{ minWidth: 160, padding: "8px 16px", borderRadius: 100, border: "1px solid var(--google-border)", fontSize: 14 }}
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
            <button className="btn-tonal" onClick={prevMonth} disabled={isPending} style={{ padding: "6px 14px", borderRadius: 100, minWidth: 0, opacity: isPending ? 0.5 : 1 }}>◀</button>
            <input
              type="month"
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={(e) => handleMonthSelect(e.target.value)}
              disabled={isPending}
              style={{
                fontSize: 15, fontWeight: 700, textAlign: "center", minWidth: 140,
                padding: "6px 16px", border: "1px solid #DADCE0", borderRadius: 100,
                outline: "none", cursor: "pointer", backgroundColor: "#fff",
                opacity: isPending ? 0.5 : 1,
              }}
            />
            <button className="btn-tonal" onClick={nextMonth} disabled={isPending} style={{ padding: "6px 14px", borderRadius: 100, minWidth: 0, opacity: isPending ? 0.5 : 1 }}>▶</button>
            {isPending && <span style={{ fontSize: 12, color: '#1A73E8', marginLeft: 4 }}>読込中...</span>}
          </div>
          <div style={{ minWidth: 180, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handlePrint}
              className="btn-tonal"
              style={{ padding: "6px 16px", borderRadius: 100, display: "flex", alignItems: "center", gap: 6 }}
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
            monthlyOvertime: ms.weekdayOvertime + ms.weekdayNightOvertime + ms.weekdayNightRegular,
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
                    <td className="col-header" style={{ width: '95px', minWidth: '95px' }}>出勤日数</td>
                    <td className="col-header" style={{ width: '95px', minWidth: '95px' }}>休日出勤日数</td>
                    <td className="col-header" style={{ width: '95px', minWidth: '95px' }}>有休取得日数</td>
                    <td className="col-header" style={{ width: '95px', minWidth: '95px' }}>代替休日日数</td>
                    <td className="col-header" style={{ width: '95px', minWidth: '95px' }}>振替休日日数</td>
                    <td className="col-header" style={{ width: '95px', minWidth: '95px' }}>欠勤日数</td>
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
                    <td className="num-cell overtime">{fmtTotal(ms.weekdayOvertime - ms.weekdayNightOvertime)}</td>
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

                const nonNightOvertime = d.overtimeMinutes - d.nightOvertimeMin;
                const hasOvertime = nonNightOvertime > 0;

                const isEditingClockIn = editingCell?.date === d.date && editingCell.field === 'clockIn';
                const isEditingClockOut = editingCell?.date === d.date && editingCell.field === 'clockOut';
                const isEditingBreak = editingCell?.date === d.date && editingCell.field === 'break';
                const isEditingStatus = editingCell?.date === d.date && editingCell.field === 'status';

                // 楽観的更新値を優先表示
                const displayClockIn = d.clockIn;
                const displayClockOut = d.clockOut;

                return (
                  <tr key={i} className={rowClass}>
                    <td>{d.date.slice(5)}</td>
                    {(() => {
                      const isEditingDayType = editingCell?.date === d.date && editingCell.field === 'dayType';
                      const hasOverride = !!localDayTypeOverrides[d.date];
                      return (
                        <td 
                          className={dowClass}
                          onClick={() => !isEditingDayType && canEdit && startDayTypeEdit(d)}
                          style={{ 
                            cursor: canEdit && !isEditingDayType ? 'pointer' : 'default',
                            position: 'relative',
                            backgroundColor: hasOverride ? '#FFF3E0' : undefined
                          }}
                        >
                          {isEditingDayType ? (
                            <div className="no-print" style={{display:'flex', gap:2, alignItems:'center'}}>
                              <select value={editDayType} onChange={e => setEditDayType(e.target.value)} style={{width:70, fontSize:11, padding:'2px'}}>
                                <option value="">自動</option>
                                <option value="weekday">平日</option>
                                <option value="saturday">法定外</option>
                                <option value="sunday">法定</option>
                                <option value="holiday">祝日</option>
                              </select>
                              <button onClick={saveDayTypeEdit} disabled={isPending} style={{cursor:'pointer', background:'none', border:'none', color:'#34A853', padding:'2px 4px', display:'inline-flex', alignItems:'center'}}><Check size={14} /></button>
                              <button onClick={() => setEditingCell(null)} style={{cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px 4px', display:'inline-flex', alignItems:'center'}}><X size={14} /></button>
                            </div>
                          ) : (
                            <div>
                              {d.dayOfWeek}{hasOverride ? '*' : ''}
                              {hasOverride && localDayTypeOverrides[d.date]?.reason && (
                                <div style={{fontSize:9, color:'#E65100', lineHeight:1.1, whiteSpace:'nowrap'}}>{localDayTypeOverrides[d.date].reason}</div>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })()}

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
                            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                              <option key={m} value={m}>{m.toString().padStart(2,'0')}</option>
                            ))}
                          </select>
                          <button onClick={saveClockEdit} disabled={isPending} style={{cursor:'pointer', background:'none', border:'none', color:'#34A853', padding:'2px 4px', display:'inline-flex', alignItems:'center'}}><Check size={14} /></button>
                          <button onClick={deleteClockRecord} disabled={isPending} style={{cursor:'pointer', background:'none', border:'none', color:'#999', padding:'2px 4px', display:'inline-flex', alignItems:'center'}} title="削除"><Trash2 size={13} /></button>
                          <button onClick={() => setEditingCell(null)} style={{cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px 4px', display:'inline-flex', alignItems:'center'}}><X size={14} /></button>
                        </div>
                      ) : (
                        displayClockIn || (canEdit ? <span style={{color:'var(--google-border)', fontSize:13}}>＋</span> : null)
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
                            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                              <option key={m} value={m}>{m.toString().padStart(2,'0')}</option>
                            ))}
                          </select>
                          <button onClick={saveClockEdit} disabled={isPending} style={{cursor:'pointer', background:'none', border:'none', color:'#34A853', padding:'2px 4px', display:'inline-flex', alignItems:'center'}}><Check size={14} /></button>
                          <button onClick={deleteClockRecord} disabled={isPending} style={{cursor:'pointer', background:'none', border:'none', color:'#999', padding:'2px 4px', display:'inline-flex', alignItems:'center'}} title="削除"><Trash2 size={13} /></button>
                          <button onClick={() => setEditingCell(null)} style={{cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px 4px', display:'inline-flex', alignItems:'center'}}><X size={14} /></button>
                        </div>
                      ) : (
                        displayClockOut || (canEdit ? <span style={{color:'var(--google-border)', fontSize:13}}>＋</span> : null)
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
                          <button onClick={saveBreakEdit} disabled={isPending} style={{cursor:'pointer', background:'none', border:'none', color:'#34A853', padding:'2px 4px', display:'inline-flex', alignItems:'center'}}><Check size={14} /></button>
                          <button onClick={() => setEditingCell(null)} style={{cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px 4px', display:'inline-flex', alignItems:'center'}}><X size={14} /></button>
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
                      {fmt(nonNightOvertime)}
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
                      {isEditingStatus && furikyuStep === 'select' && editingCell?.date === d.date ? (
                        <div className="no-print" style={{display:'flex', flexDirection:'column', gap:4, minWidth:140, padding:4, background:'#FFF8E1', borderRadius:4, border:'1px solid #FFB300'}}>
                          <div style={{fontSize:11, fontWeight:700, color:'#E65100'}}>振替出勤日を選択:</div>
                          <div style={{maxHeight:120, overflowY:'auto'}}>
                            {furikyuCandidates.map(c => (
                              <button
                                key={c.date}
                                onClick={() => confirmFurikyu(c.date)}
                                disabled={isPending}
                                style={{display:'block', width:'100%', textAlign:'left', fontSize:11, padding:'3px 6px', cursor:'pointer', background:'none', border:'1px solid var(--google-border)', borderRadius:3, marginBottom:2}}
                              >
                                {c.date.slice(5)} ({c.dayOfWeek})
                              </button>
                            ))}
                            {furikyuCandidates.length === 0 && <div style={{fontSize:10, color:'#999'}}>候補なし</div>}
                          </div>
                          <button onClick={() => { setFurikyuStep(null); setEditingCell(null); }} style={{fontSize:11, cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px'}}>キャンセル</button>
                        </div>
                      ) : isEditingStatus && furikyuStep === 'daikyu' && editingCell?.date === d.date ? (
                        <div className="no-print" style={{display:'flex', flexDirection:'column', gap:4, minWidth:140, padding:4, background:'#E3F2FD', borderRadius:4, border:'1px solid #42A5F5'}}>
                          <div style={{fontSize:11, fontWeight:700, color:'#1565C0'}}>休日出勤日を選択:</div>
                          <div style={{maxHeight:120, overflowY:'auto'}}>
                            {daikyuCandidates.map(c => (
                              <button
                                key={c.date}
                                onClick={() => confirmDaikyu(c.date)}
                                disabled={isPending}
                                style={{display:'block', width:'100%', textAlign:'left', fontSize:11, padding:'3px 6px', cursor:'pointer', background:'none', border:'1px solid var(--google-border)', borderRadius:3, marginBottom:2}}
                              >
                                {c.date.slice(5)} ({c.dayOfWeek})
                              </button>
                            ))}
                            {daikyuCandidates.length === 0 && <div style={{fontSize:10, color:'#999'}}>候補なし</div>}
                          </div>
                          <button onClick={() => { setFurikyuStep(null); setEditingCell(null); }} style={{fontSize:11, cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px'}}>キャンセル</button>
                        </div>
                      ) : isEditingStatus ? (
                        <div className="no-print" style={{display:'flex', flexDirection:'column', gap:2, minWidth:100}}>
                          <select value={editStatus} onChange={e => { setEditStatus(e.target.value); if (!['STATUS_DAIKYU','STATUS_FURIKYU'].includes(e.target.value)) setEditNote(''); setFurikyuStep(null); }} style={{fontSize:11, padding:'2px'}}>
                            <option value="">通常</option>
                            <option value="STATUS_DAIKYU">代休</option>
                            <option value="STATUS_FURIKYU">振休</option>
                            <option value="STATUS_YUKYU">有給</option>
                            <option value="STATUS_KEKKIN">欠勤</option>
                          </select>
                          <div style={{display:'flex', gap:2}}>
                            <button onClick={saveStatusEdit} disabled={isPending} style={{cursor:'pointer', background:'none', border:'none', color:'#34A853', padding:'2px 4px', display:'inline-flex', alignItems:'center'}}><Check size={14} /></button>
                            <button onClick={() => { setEditingCell(null); setFurikyuStep(null); }} style={{cursor:'pointer', background:'none', border:'none', color:'var(--danger)', padding:'2px 4px', display:'inline-flex', alignItems:'center'}}><X size={14} /></button>
                          </div>
                        </div>
                      ) : (
                        <div style={{display:'flex', alignItems:'center', gap:4}}>
                          <span style={{flex:1}}>
                          {(() => {
                            const parts: string[] = [];
                            if (isLeave) parts.push(d.status);
                            else if (d.status === "退勤済") parts.push("退勤済");
                            const ov = localDayTypeOverrides[d.date];
                            if (ov?.reason) parts.push(ov.reason);
                            return parts.join(' / ') || '';
                          })()}
                          </span>
                          {canEdit && (localRecords[d.date] || []).length > 0 && (
                            <button
                              className="no-print"
                              onClick={(e) => { e.stopPropagation(); deleteDayRecords(d.date); }}
                              disabled={isPending}
                              style={{cursor:'pointer', background:'none', border:'none', color:'#bbb', padding:'2px 4px', display:'inline-flex', alignItems:'center', flexShrink:0}}
                              title="この日のデータを全削除"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
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
