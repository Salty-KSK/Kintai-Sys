"use client";

import { useState, useTransition } from "react";
import { clock, deleteRecord, updateRecordTime, updateBreakTime } from "./actions";
import { Clock, LogOut, Trash2, Pencil, Check, X } from "lucide-react";

export default function ClientDashboard({ initialRecords }: { initialRecords: any[] }) {
  const [isPending, startTransition] = useTransition();
  const [editingRecord, setEditingRecord] = useState<{ id: string, h: string, m: string } | null>(null);

  const handleClock = (type: "CLOCK_IN" | "CLOCK_OUT") => {
    startTransition(async () => {
      await clock(type);
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("本当にこの打刻を取り消しますか？")) {
      startTransition(async () => {
        await deleteRecord(id);
      });
    }
  };

  const startEdit = (id: string, currentTimestamp: Date) => {
    const t = new Date(currentTimestamp);
    const bizHour = t.getHours() < 5 ? t.getHours() + 24 : t.getHours();
    setEditingRecord({
      id,
      h: bizHour.toString().padStart(2, '0'),
      m: t.getMinutes().toString().padStart(2, '0')
    });
  };

  const cancelEdit = () => setEditingRecord(null);

  const saveEdit = () => {
    if (!editingRecord) return;
    const newTime = `${editingRecord.h}:${editingRecord.m}`;
    startTransition(async () => {
      await updateRecordTime(editingRecord.id, newTime);
      setEditingRecord(null);
    });
  };

  const hasPunchedIn = initialRecords.some(r => r.type === "CLOCK_IN");
  const hasPunchedOut = initialRecords.some(r => r.type === "CLOCK_OUT");

  const punchRecords = initialRecords.filter((r) => r.type === "CLOCK_IN" || r.type === "CLOCK_OUT");

  const breakRecord = initialRecords.find(r => r.type === "BREAK_TIME");
  const currentBreakVal = breakRecord && typeof (breakRecord as any).breakMinutes === 'number' 
    ? String((breakRecord as any).breakMinutes) 
    : "auto";

  const handleBreakChange = (val: string) => {
    startTransition(async () => {
      const minutes = val === "auto" ? null : parseInt(val, 10);
      await updateBreakTime(new Date().toISOString(), minutes);
    });
  };

  return (
    <div className="animate-fade-in">
      <div className="grid-2 mb-6">
        <button 
          onClick={() => handleClock("CLOCK_IN")}
          disabled={hasPunchedIn || isPending}
          className="btn-primary"
          style={hasPunchedIn || isPending ? { height: '120px', flexDirection: 'column', fontSize: '1.25rem' } : { height: '120px', flexDirection: 'column', fontSize: '1.25rem', backgroundColor: '#eef6ff', color: '#0056b3', border: '4px solid #007bff' }}
        >
          <Clock size={32} />
          <span className="font-bold">出勤</span>
        </button>

        <button 
          onClick={() => handleClock("CLOCK_OUT")}
          disabled={!hasPunchedIn || hasPunchedOut || isPending}
          className={hasPunchedOut || !hasPunchedIn || isPending ? "btn-secondary" : "btn-primary"}
          style={hasPunchedOut || !hasPunchedIn || isPending ? { height: '120px', flexDirection: 'column', fontSize: '1.25rem' } : { height: '120px', flexDirection: 'column', fontSize: '1.25rem', backgroundColor: '#ffeef0', color: '#b30010', border: '4px solid #dc3545' }}
        >
          <LogOut size={32} />
          <span className="font-bold">退勤</span>
        </button>
      </div>

      <div className="mt-6 mb-6">
        <div className="flex items-center justify-between p-4 mb-4" style={{ backgroundColor: '#e8f0fe', borderRadius: '4px', border: '1px solid #c2d7fa' }}>
          <span className="font-bold">本日の休憩時間:</span>
          <select 
            value={currentBreakVal} 
            onChange={(e) => handleBreakChange(e.target.value)}
            disabled={isPending}
            className="input-field"
            style={{ width: 'auto', padding: '0.4rem', fontWeight: 'bold' }}
          >
            <option value="auto">自動計算 (実働に合わせて45/60分)</option>
            <option value="0">0分 (休憩なし)</option>
            <option value="15">15分</option>
            <option value="30">30分</option>
            <option value="45">45分</option>
            <option value="60">1時間 (60分)</option>
            <option value="90">1時間30分 (90分)</option>
            <option value="120">2時間 (120分)</option>
          </select>
        </div>

        <h3 className="form-label text-lg pb-2" style={{ borderBottom: '1px solid var(--border)' }}>本日の打刻履歴・修正</h3>
        <p className="text-sm text-muted mb-4 mt-2">打ち忘れや押し間違いがあった場合は、右側のアイコンから時刻の修正・取り消しが行えます。</p>

        {punchRecords.length === 0 ? (
          <p className="text-gray-500 italic">まだ本日の打刻はありません。</p>
        ) : (
          <ul className="space-y-3" style={{ listStyle: 'none' }}>
            {punchRecords.map((r) => {
              const isEditing = editingRecord?.id === r.id;
              
              return (
                <li key={r.id} className="flex items-center justify-between mb-2 p-4" style={{ backgroundColor: '#fafafa', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center">
                      <span className={`status-dot ${r.type === 'CLOCK_IN' ? 'active' : 'inactive'}`}></span>
                      <span style={{ fontWeight: 700, width: '4rem' }}>{r.type === 'CLOCK_IN' ? '出勤' : '退勤'}</span>
                    </div>
                    
                    {/* 通常表示 または リスト選択UI */}
                    {!isEditing ? (
                      <span className="text-lg font-bold">
                        {(() => {
                           const d = new Date(r.timestamp);
                           const h = d.getHours() < 5 ? d.getHours() + 24 : d.getHours();
                           return `${h}:${d.getMinutes().toString().padStart(2, '0')}`;
                        })()}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <select 
                          value={editingRecord!.h} 
                          onChange={(e) => setEditingRecord({ ...editingRecord!, h: e.target.value })}
                          className="input-field"
                          style={{ padding: '0.2rem', width: 'auto', fontSize: '1.25rem', fontWeight: 'bold' }}
                        >
                          {Array.from({ length: 24 }).map((_, i) => {
                            const hour = i + 5; // 5時から28時(翌4時)まで
                            const v = hour.toString().padStart(2, '0');
                            const label = hour >= 24 ? `翌${(hour - 24).toString().padStart(2, '0')}` : v;
                            return <option key={v} value={v}>{label}</option>;
                          })}
                        </select>
                        <span className="font-bold">:</span>
                        <select 
                          value={editingRecord!.m} 
                          onChange={(e) => setEditingRecord({ ...editingRecord!, m: e.target.value })}
                          className="input-field"
                          style={{ padding: '0.2rem', width: 'auto', fontSize: '1.25rem', fontWeight: 'bold' }}
                        >
                          {Array.from({ length: 60 }).map((_, i) => {
                            const v = i.toString().padStart(2, '0');
                            return <option key={v} value={v}>{v}</option>;
                          })}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* 右側のアクションボタン */}
                  {!isEditing ? (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => startEdit(r.id, r.timestamp)}
                        disabled={isPending}
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.6rem' }}
                        title="時刻を修正"
                      >
                        <Pencil size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(r.id)}
                        disabled={isPending}
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        title="打刻を取り消し"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button 
                        onClick={saveEdit}
                        disabled={isPending}
                        className="btn-primary"
                        style={{ padding: '0.4rem 0.6rem', backgroundColor: '#34A853' }}
                        title="保存する"
                      >
                        <Check size={18} />
                      </button>
                      <button 
                        onClick={cancelEdit}
                        disabled={isPending}
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.6rem' }}
                        title="キャンセル"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
