"use client";

import { useState, useTransition } from "react";
import { updateUserRole, updateUserDepartment, addHoliday, deleteHoliday, syncJapaneseHolidays, registerUser } from "@/app/actions";
import { formatTime } from "@/lib/attendanceCalc";
import { type DailySummary } from "@/lib/summaryCalc";
import OvertimeHeatmap from "./overtime-heatmap";

type TodayEntry = {
  id: string;
  name: string;
  department: string;
  clockIn: string | null;
  clockOut: string | null;
  workingMinutes: number;
  overtimeMinutes: number;
  elapsedMinutes: number;
  status: string;
};

type UserEntry = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
};

type EmployeeOvertime = {
  id: string;
  name: string;
  department: string | null;
  dailySummaries: DailySummary[];
  monthlyOvertime: number;
  yearlyOvertime: number;
  monthlyBreakdowns?: { month: number; periodStr: string; overtimeMin: number; holidayMin: number; totalMin: number }[];
};

type OvertimeData = {
  year: number;
  month: number;
  periodStr: string;
  employees: EmployeeOvertime[];
};

type HolidayEntry = {
  id: string;
  date: string;
  name: string;
};

type Props = {
  todayData: TodayEntry[];
  allUsers: UserEntry[];
  currentRole: string;
  currentDepartment: string;
  overtimeData: OvertimeData;
  holidays: HolidayEntry[];
};

const ROLE_LABELS: Record<string, string> = {
  USER: "一般",
  MANAGER: "管理者",
  ADMIN: "責任者",
};

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  USER: { bg: "#F0F4F9", color: "#5F6368" },
  MANAGER: { bg: "#FEF7E0", color: "#E37400" },
  ADMIN: { bg: "#D3E3FD", color: "#1A73E8" },
};

export default function AdminClient({ todayData, allUsers, currentRole, currentDepartment, overtimeData, holidays }: Props) {
  const [activeTab, setActiveTab] = useState<"today" | "users" | "overtime" | "holidays">("today");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [deptValue, setDeptValue] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");

  // 新規ユーザー登録用の状態
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmailLocal, setNewEmailLocal] = useState("");
  const [newEmpId, setNewEmpId] = useState("");
  const [newDept, setNewDept] = useState(currentRole === "MANAGER" ? currentDepartment || "本社" : "本社");
  const [newRole, setNewRole] = useState("USER");

  const isAdmin = currentRole === "ADMIN";

  const handleRegisterUser = () => {
    setFeedback(null);
    if (!newEmailLocal.trim() || !newName.trim()) {
      setFeedback("エラー: 名前とメールアドレスは必須です");
      return;
    }
    startTransition(async () => {
      const result = await registerUser({
        email: newEmailLocal.trim() + "@palsekkei.co.jp",
        name: newName,
        employeeId: newEmpId || null,
        department: newDept || null,
        role: newRole,
      });
      if (result.error) {
        setFeedback(`エラー: ${result.error}`);
      } else {
        setFeedback("新規ユーザーを事前登録しました");
        setNewEmailLocal("");
        setNewName("");
        setNewEmpId("");
        setNewDept(currentRole === "MANAGER" ? currentDepartment || "本社" : "本社");
        setNewRole("USER");
        setShowAddForm(false);
      }
    });
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateUserRole(userId, newRole);
      if (result.error) {
        setFeedback(`エラー: ${result.error}`);
      } else {
        setFeedback("ロールを更新しました（次回ページ読み込みで反映）");
      }
    });
  };

  const handleDeptSave = (userId: string) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateUserDepartment(userId, deptValue.trim() || null);
      if (result.error) {
        setFeedback(`エラー: ${result.error}`);
      } else {
        setFeedback("部署を更新しました");
        setEditingDept(null);
      }
    });
  };

  const getRoleOptions = (userRole: string) => {
    if (isAdmin) {
      return ["USER", "MANAGER", "ADMIN"];
    }
    // MANAGERの場合はUSERのみ設定可能
    return ["USER"];
  };

  return (
    <>
      {/* タブ切り替え */}
      <div className="flex gap-3 mb-4">
        <button
          className={`btn-tonal ${activeTab === "today" ? "" : "btn-tonal-inactive"}`}
          style={activeTab === "today" ? { backgroundColor: 'var(--google-active-pill)' } : { backgroundColor: 'transparent', color: 'var(--google-text-sub)' }}
          onClick={() => setActiveTab("today")}
        >
          本日の勤務状況
        </button>
        <button
          className={`btn-tonal ${activeTab === "users" ? "" : "btn-tonal-inactive"}`}
          style={activeTab === "users" ? { backgroundColor: 'var(--google-active-pill)' } : { backgroundColor: 'transparent', color: 'var(--google-text-sub)' }}
          onClick={() => setActiveTab("users")}
        >
          ユーザー管理
        </button>
        <button
          className={`btn-tonal ${activeTab === "overtime" ? "" : "btn-tonal-inactive"}`}
          style={activeTab === "overtime" ? { backgroundColor: 'var(--google-active-pill)' } : { backgroundColor: 'transparent', color: 'var(--google-text-sub)' }}
          onClick={() => setActiveTab("overtime")}
        >
          残業管理
        </button>
        {isAdmin && (
          <button
            className={`btn-tonal ${activeTab === "holidays" ? "" : "btn-tonal-inactive"}`}
            style={activeTab === "holidays" ? { backgroundColor: 'var(--google-active-pill)' } : { backgroundColor: 'transparent', color: 'var(--google-text-sub)' }}
            onClick={() => setActiveTab("holidays")}
          >
            祝日管理
          </button>
        )}
      </div>

      {/* フィードバックメッセージ */}
      {feedback && (
        <div className="status-card mb-4" style={{ color: feedback.startsWith("エラー") ? 'var(--danger)' : '#34A853' }}>
          {feedback}
        </div>
      )}

      {/* ===== 本日の勤務状況タブ ===== */}
      {activeTab === "today" && (
        <div className="card animate-fade-in">
          <h3 className="form-label text-lg mb-4">
            本日の出退勤と勤務時間
            {currentRole === "MANAGER" && currentDepartment && (
              <span style={{ fontSize: 13, color: 'var(--google-text-sub)', fontWeight: 400, marginLeft: 12 }}>
                （{currentDepartment}）
              </span>
            )}
          </h3>
          <table className="data-table mt-4">
            <thead>
              <tr>
                <th>社員名</th>
                {isAdmin && <th>部署</th>}
                <th>出勤時刻</th>
                <th>退勤時刻</th>
                <th>実働</th>
                <th>残業</th>
                <th>ステータス</th>
              </tr>
            </thead>
            <tbody>
              {todayData.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 'bold' }}>{user.name}</td>
                  {isAdmin && <td style={{ fontSize: 13, color: 'var(--google-text-sub)' }}>{user.department || '—'}</td>}
                  <td>{user.clockIn || '-'}</td>
                  <td>{user.clockOut || '-'}</td>
                  <td style={{ fontWeight: 'bold' }}>
                    {user.elapsedMinutes > 0 ? formatTime(user.workingMinutes) : '-'}
                  </td>
                  <td style={{
                    color: user.overtimeMinutes > 0 ? 'var(--danger)' : 'inherit',
                    fontWeight: user.overtimeMinutes > 0 ? 'bold' : 'normal'
                  }}>
                    {user.elapsedMinutes > 0 ? formatTime(user.overtimeMinutes) : '-'}
                  </td>
                  <td className={`font-bold ${user.status === '勤務中' ? 'text-success' : ''}`}>
                    {user.status}
                  </td>
                </tr>
              ))}

              {todayData.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="text-center text-muted" style={{ padding: '24px 0' }}>
                    ユーザーデータがまだありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== ユーザー管理タブ ===== */}
      {activeTab === "users" && (
        <div className="card animate-fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className="form-label text-lg" style={{ margin: 0 }}>
              ユーザー一覧とロール管理
              {currentRole === "MANAGER" && currentDepartment && (
                <span style={{ fontSize: 13, color: 'var(--google-text-sub)', fontWeight: 400, marginLeft: 12 }}>
                  （{currentDepartment}）
                </span>
              )}
            </h3>
            <button
              className="btn-tonal"
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: showAddForm ? '#F1F3F4' : '#E8F0FE',
                color: showAddForm ? '#5F6368' : '#1A73E8',
              }}
            >
              {showAddForm ? '✕ 閉じる' : '➕ 従業員を事前登録'}
            </button>
          </div>

          {/* 新規登録フォーム */}
          {showAddForm && (
            <div style={{
              background: '#F8F9FA',
              border: '1px solid var(--google-border)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700 }}>事前従業員登録</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px' }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--google-text-sub)' }}>名前（必須）</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="山田 太郎"
                    style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 240px' }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--google-text-sub)' }}>メールアドレス（必須）</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      value={newEmailLocal}
                      onChange={e => setNewEmailLocal(e.target.value)}
                      placeholder="yamada"
                      style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, outline: 'none', width: '100%', paddingRight: '120px' }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--google-text-sub)', position: 'absolute', right: 12, pointerEvents: 'none' }}>
                      @palsekkei.co.jp
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 120px' }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--google-text-sub)' }}>社員番号（任意）</label>
                  <input
                    type="text"
                    value={newEmpId}
                    onChange={e => setNewEmpId(e.target.value)}
                    placeholder="EMP001"
                    style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 140px' }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--google-text-sub)' }}>部署</label>
                  <select
                    value={newDept}
                    onChange={e => setNewDept(e.target.value)}
                    disabled={currentRole === "MANAGER"}
                    style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, outline: 'none', backgroundColor: currentRole === "MANAGER" ? '#F1F3F4' : '#fff', cursor: currentRole === "MANAGER" ? 'default' : 'pointer' }}
                  >
                    <option value="本社">本社</option>
                    <option value="工事第1課">工事第1課</option>
                    <option value="工事第2課">工事第2課</option>
                    <option value="工事第3課">工事第3課</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 120px' }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--google-text-sub)' }}>権限</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    disabled={currentRole === "MANAGER"}
                    style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, outline: 'none', backgroundColor: currentRole === "MANAGER" ? '#F1F3F4' : '#fff' }}
                  >
                    <option value="USER">一般</option>
                    {currentRole === "ADMIN" && <option value="MANAGER">管理者</option>}
                    {currentRole === "ADMIN" && <option value="ADMIN">責任者</option>}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  className="btn-primary"
                  disabled={isPending || !newName.trim() || !newEmailLocal.trim()}
                  onClick={handleRegisterUser}
                  style={{ padding: '6px 16px', fontSize: 12, borderRadius: 8, cursor: 'pointer' }}
                >
                  登録する
                </button>
              </div>
            </div>
          )}

          <table className="data-table mt-4">
            <thead>
              <tr>
                <th>名前</th>
                <th>メールアドレス</th>
                <th>部署</th>
                <th>ロール</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((user) => {
                const roleStyle = ROLE_COLORS[user.role] || ROLE_COLORS.USER;
                const roleOptions = getRoleOptions(user.role);
                const isEditingThisDept = editingDept === user.id;

                return (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 'bold' }}>{user.name}</td>
                    <td style={{ fontSize: 13 }}>{user.email}</td>
                    <td>
                      {isAdmin ? (
                        isEditingThisDept ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              type="text"
                              value={deptValue}
                              onChange={(e) => setDeptValue(e.target.value)}
                              placeholder="部署名"
                              style={{
                                padding: '4px 8px', fontSize: 13, border: '1px solid #DADCE0',
                                borderRadius: 6, width: 100, outline: 'none',
                              }}
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') handleDeptSave(user.id); }}
                            />
                            <button
                              onClick={() => handleDeptSave(user.id)}
                              disabled={isPending}
                              style={{
                                padding: '4px 8px', fontSize: 12, backgroundColor: '#1A73E8',
                                color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
                              }}
                            >✓</button>
                            <button
                              onClick={() => setEditingDept(null)}
                              style={{
                                padding: '4px 8px', fontSize: 12, backgroundColor: '#F0F4F9',
                                color: '#5F6368', border: 'none', borderRadius: 6, cursor: 'pointer',
                              }}
                            >✕</button>
                          </div>
                        ) : (
                          <span
                            onClick={() => { setEditingDept(user.id); setDeptValue(user.department || ''); }}
                            style={{
                              cursor: 'pointer', fontSize: 13, color: user.department ? 'inherit' : '#9AA0A6',
                              borderBottom: '1px dashed #DADCE0', paddingBottom: 1,
                            }}
                            title="クリックして部署を編集"
                          >
                            {user.department || '未設定'}
                          </span>
                        )
                      ) : (
                        <span style={{ fontSize: 13, color: user.department ? 'inherit' : '#9AA0A6' }}>
                          {user.department || '—'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block', padding: '4px 12px', fontSize: 12, fontWeight: 600,
                          borderRadius: 16, backgroundColor: roleStyle.bg, color: roleStyle.color,
                        }}
                      >
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td>
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={isPending}
                        style={{
                          padding: '6px 12px', fontSize: 13, border: '1px solid #DADCE0',
                          borderRadius: 8, backgroundColor: '#fff', cursor: 'pointer', outline: 'none',
                        }}
                      >
                        {/* 現在のロールは必ず選択肢に含める */}
                        {!roleOptions.includes(user.role) && (
                          <option value={user.role}>{ROLE_LABELS[user.role] || user.role}</option>
                        )}
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}

              {allUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted" style={{ padding: '24px 0' }}>
                    ユーザーがいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 残業管理タブ ===== */}
      {activeTab === "overtime" && (
        <OvertimeHeatmap overtimeData={overtimeData} />
      )}

      {/* ===== 祝日管理タブ ===== */}
      {activeTab === "holidays" && isAdmin && (
        <div className="card animate-fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className="form-label text-lg" style={{ margin: 0 }}>祝日一覧</h3>
            <button
              className="btn-tonal"
              disabled={isPending}
              onClick={() => {
                setFeedback(null);
                startTransition(async () => {
                  const result = await syncJapaneseHolidays();
                  if (result.error) {
                    setFeedback(`エラー: ${result.error}`);
                  } else {
                    setFeedback(`祝日データを同期しました（${(result as any).count}件）`);
                  }
                });
              }}
            >
              {isPending ? '同期中...' : '🔄 祝日を一括取得'}
            </button>
          </div>

          {/* 手動追加フォーム */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              style={{
                padding: '8px 12px', fontSize: 14, border: '1px solid #DADCE0',
                borderRadius: 8, outline: 'none',
              }}
            />
            <input
              type="text"
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
              placeholder="祝日名を入力"
              style={{
                padding: '8px 12px', fontSize: 14, border: '1px solid #DADCE0',
                borderRadius: 8, outline: 'none', minWidth: 180,
              }}
            />
            <button
              className="btn-primary"
              disabled={isPending || !holidayDate || !holidayName}
              onClick={() => {
                setFeedback(null);
                startTransition(async () => {
                  const result = await addHoliday(holidayDate, holidayName);
                  if (result.error) {
                    setFeedback(`エラー: ${result.error}`);
                  } else {
                    setFeedback('祝日を追加しました');
                    setHolidayDate('');
                    setHolidayName('');
                  }
                });
              }}
            >
              追加
            </button>
          </div>

          {/* 祝日一覧テーブル */}
          <table className="data-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>祝日名</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => {
                const d = new Date(h.date);
                const dateStr = `${d.getUTCFullYear()}/${(d.getUTCMonth()+1).toString().padStart(2,'0')}/${d.getUTCDate().toString().padStart(2,'0')}`;
                return (
                  <tr key={h.id}>
                    <td>{dateStr}</td>
                    <td>{h.name}</td>
                    <td>
                      <button
                        className="btn-tonal"
                        style={{ fontSize: 12, padding: '4px 12px', color: 'var(--danger)' }}
                        disabled={isPending}
                        onClick={() => {
                          setFeedback(null);
                          startTransition(async () => {
                            const result = await deleteHoliday(h.id);
                            if (result.error) {
                              setFeedback(`エラー: ${result.error}`);
                            } else {
                              setFeedback('祝日を削除しました');
                            }
                          });
                        }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}

              {holidays.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted" style={{ padding: '24px 0' }}>
                    祝日が登録されていません。「祝日を一括取得」ボタンで日本の祝日を取得できます。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
