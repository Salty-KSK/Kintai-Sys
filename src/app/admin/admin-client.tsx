"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUser, addHoliday, deleteHoliday, syncJapaneseHolidays, registerUser } from "@/app/actions";
import { formatTime } from "@/lib/attendanceCalc";
import { type DailySummary } from "@/lib/summaryCalc";
import OvertimeHeatmap from "./overtime-heatmap";
import { UserPlus, X, RefreshCw } from "lucide-react";

type TodayEntry = {
  id: string;
  name: string;
  employeeId: string;
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
  position: string;
  employeeId: string;
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
  currentUserId: string;
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

export default function AdminClient({ todayData, allUsers, currentRole, currentUserId, currentDepartment, overtimeData, holidays }: Props) {
  // 勤務状況タブ・残業管理タブでは自分自身を除外（取締役など勤怠不要のユーザー向け）
  const filteredTodayData = todayData.filter(u => u.id !== currentUserId);
  const filteredOvertimeEmployees = { ...overtimeData, employees: overtimeData.employees.filter(e => e.id !== currentUserId) };
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"today" | "users" | "overtime" | "holidays">("today");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");

  // 新規ユーザー登録用の状態
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmailLocal, setNewEmailLocal] = useState("");
  const [newEmpId, setNewEmpId] = useState("");
  const [newDept, setNewDept] = useState(currentRole === "MANAGER" ? currentDepartment || "本社" : "本社");
  const [newPosition, setNewPosition] = useState("");
  const [newRole, setNewRole] = useState("USER");

  // 編集用の状態
  const [editingUser, setEditingUser] = useState<UserEntry | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmpId, setEditEmpId] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editRole, setEditRole] = useState("");

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
        position: newPosition.trim() || null,
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
        setNewPosition("");
        setShowAddForm(false);
        router.refresh();
      }
    });
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await updateUser(editingUser.id, {
        name: editName.trim(),
        employeeId: editEmpId.trim() || null,
        department: editDept || null,
        position: editPosition.trim() || null,
        role: editRole,
      });
      if (result.error) {
        setFeedback(`エラー: ${result.error}`);
      } else {
        setFeedback("ユーザー情報を更新しました");
        setEditingUser(null);
        router.refresh();
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
                <th>社員番号</th>
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
              {filteredTodayData.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontSize: 13, color: user.employeeId ? 'inherit' : '#9AA0A6' }}>{user.employeeId || '—'}</td>
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
                  <td colSpan={isAdmin ? 8 : 7} className="text-center text-muted" style={{ padding: '24px 0' }}>
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
              {showAddForm ? <><X size={14} /> 閉じる</> : <><UserPlus size={14} /> 従業員を事前登録</>}
            </button>
          </div>

          {/* 新規登録フォーム */}
          {showAddForm && (
            <div style={{
              background: '#F8F9FA',
              border: '1px solid var(--google-border)',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 110px', minWidth: 0 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--google-text-sub)' }}>名前 *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="山田 太郎"
                    style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #DADCE0', borderRadius: 6, outline: 'none', width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 160px', minWidth: 0 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--google-text-sub)' }}>メール *</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      value={newEmailLocal}
                      onChange={e => setNewEmailLocal(e.target.value)}
                      placeholder="yamada"
                      style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #DADCE0', borderRadius: 6, outline: 'none', width: '100%', paddingRight: '100px' }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--google-text-sub)', position: 'absolute', right: 8, pointerEvents: 'none' }}>
                      @palsekkei.co.jp
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '0 1 80px', minWidth: 0 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--google-text-sub)' }}>社員番号</label>
                  <input
                    type="text"
                    value={newEmpId}
                    onChange={e => setNewEmpId(e.target.value)}
                    placeholder="001"
                    style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #DADCE0', borderRadius: 6, outline: 'none', width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '0 1 90px', minWidth: 0 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--google-text-sub)' }}>部署</label>
                  <select
                    value={newDept}
                    onChange={e => setNewDept(e.target.value)}
                    disabled={currentRole === "MANAGER"}
                    style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #DADCE0', borderRadius: 6, outline: 'none', backgroundColor: currentRole === "MANAGER" ? '#F1F3F4' : '#fff', width: '100%' }}
                  >
                    <option value="本社">本社</option>
                    <option value="工事第1課">工事第1課</option>
                    <option value="工事第2課">工事第2課</option>
                    <option value="工事第3課">工事第3課</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '0 1 70px', minWidth: 0 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--google-text-sub)' }}>役職</label>
                  <input
                    type="text"
                    value={newPosition}
                    onChange={e => setNewPosition(e.target.value)}
                    placeholder="課長"
                    style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #DADCE0', borderRadius: 6, outline: 'none', width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '0 1 70px', minWidth: 0 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--google-text-sub)' }}>権限</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    disabled={currentRole === "MANAGER"}
                    style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #DADCE0', borderRadius: 6, outline: 'none', backgroundColor: currentRole === "MANAGER" ? '#F1F3F4' : '#fff', width: '100%' }}
                  >
                    <option value="USER">一般</option>
                    {currentRole === "ADMIN" && <option value="MANAGER">管理者</option>}
                    {currentRole === "ADMIN" && <option value="ADMIN">責任者</option>}
                  </select>
                </div>
                <button
                  disabled={isPending || !newName.trim() || !newEmailLocal.trim()}
                  onClick={handleRegisterUser}
                  style={{
                    padding: '6px 16px', fontSize: 12, fontWeight: 500, borderRadius: 100,
                    cursor: 'pointer', backgroundColor: '#1A73E8', color: '#fff',
                    border: 'none', transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                    opacity: (isPending || !newName.trim() || !newEmailLocal.trim()) ? 0.5 : 1,
                    alignSelf: 'flex-end',
                  }}
                  onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1557B0'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#1A73E8'; }}
                >
                  登録
                </button>
              </div>
            </div>
          )}

          <table className="data-table mt-4">
            <thead>
              <tr>
                <th>名前</th>
                <th>社員番号</th>
                <th>メールアドレス</th>
                <th>部署</th>
                <th>役職</th>
                <th>ロール</th>
                <th style={{ width: 80 }}>編集</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((user) => {
                const roleStyle = ROLE_COLORS[user.role] || ROLE_COLORS.USER;
                const canEdit = currentRole === "ADMIN" || currentRole === "MANAGER";

                return (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 'bold' }}>{user.name}</td>
                    <td style={{ fontSize: 13, color: user.employeeId ? 'inherit' : '#9AA0A6' }}>
                      {user.employeeId || '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>{user.email}</td>
                    <td style={{ fontSize: 13, color: user.department ? 'inherit' : '#9AA0A6' }}>
                      {user.department || '—'}
                    </td>
                    <td style={{ fontSize: 13, color: user.position ? 'inherit' : '#9AA0A6' }}>
                      {user.position || '—'}
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
                      {canEdit && (
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setEditName(user.name);
                            setEditEmpId(user.employeeId || "");
                            setEditDept(user.department || "");
                            setEditPosition(user.position || "");
                            setEditRole(user.role);
                          }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '5px 12px', fontSize: 12, fontWeight: 500,
                            borderRadius: 16, cursor: 'pointer',
                            backgroundColor: 'transparent', color: '#1A73E8',
                            border: '1px solid #DADCE0',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#E8F0FE'; e.currentTarget.style.borderColor = '#1A73E8'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#DADCE0'; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          編集
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {allUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted" style={{ padding: '24px 0' }}>
                    ユーザーがいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ユーザー編集モーダル */}
          {editingUser && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', zIndex: 1000
            }}>
              <div className="card" style={{ width: '100%', maxWidth: '480px', margin: '16px', padding: '24px', position: 'relative' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>ユーザー情報を編集</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--google-text-sub)' }}>名前</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="名前"
                      style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, outline: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--google-text-sub)' }}>社員番号</label>
                    <input
                      type="text"
                      value={editEmpId}
                      onChange={e => setEditEmpId(e.target.value)}
                      placeholder="EMP001"
                      style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, outline: 'none' }}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--google-text-sub)' }}>部署</label>
                    <select
                      value={editDept}
                      onChange={e => setEditDept(e.target.value)}
                      disabled={currentRole === "MANAGER"}
                      style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, outline: 'none', backgroundColor: currentRole === "MANAGER" ? '#F1F3F4' : '#fff' }}
                    >
                      <option value="">未設定</option>
                      <option value="本社">本社</option>
                      <option value="工事第1課">工事第1課</option>
                      <option value="工事第2課">工事第2課</option>
                      <option value="工事第3課">工事第3課</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--google-text-sub)' }}>役職</label>
                    <input
                      type="text"
                      value={editPosition}
                      onChange={e => setEditPosition(e.target.value)}
                      placeholder="役職名"
                      style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, outline: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--google-text-sub)' }}>権限</label>
                    <select
                      value={editRole}
                      onChange={e => setEditRole(e.target.value)}
                      disabled={currentRole === "MANAGER"}
                      style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #DADCE0', borderRadius: 8, outline: 'none', backgroundColor: currentRole === "MANAGER" ? '#F1F3F4' : '#fff' }}
                    >
                      <option value="USER">一般</option>
                      {currentRole === "ADMIN" && <option value="MANAGER">管理者</option>}
                      {currentRole === "ADMIN" && <option value="ADMIN">責任者</option>}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                  <button
                    onClick={() => setEditingUser(null)}
                    style={{
                      padding: '8px 20px', fontSize: 13, fontWeight: 500, borderRadius: 100,
                      cursor: 'pointer', backgroundColor: 'transparent', color: '#5F6368',
                      border: '1px solid #DADCE0', transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F1F3F4'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleUpdateUser}
                    disabled={isPending || !editName.trim()}
                    style={{
                      padding: '8px 20px', fontSize: 13, fontWeight: 500, borderRadius: 100,
                      cursor: 'pointer', backgroundColor: '#1A73E8', color: '#fff',
                      border: 'none', transition: 'all 0.15s ease',
                      opacity: (isPending || !editName.trim()) ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1557B0'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#1A73E8'; }}
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 残業管理タブ ===== */}
      {activeTab === "overtime" && (
        <OvertimeHeatmap overtimeData={filteredOvertimeEmployees} />
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
                    router.refresh();
                  }
                });
              }}
            >
              {isPending ? '同期中...' : <><RefreshCw size={14} /> 祝日を一括取得</>}
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
                    router.refresh();
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
                              router.refresh();
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
