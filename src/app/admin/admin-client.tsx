"use client";

import { useState, useTransition } from "react";
import { updateUserRole, updateUserDepartment } from "@/app/actions";
import { formatTime } from "@/lib/attendanceCalc";

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

type Props = {
  todayData: TodayEntry[];
  allUsers: UserEntry[];
  currentRole: string;
  currentDepartment: string;
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

export default function AdminClient({ todayData, allUsers, currentRole, currentDepartment }: Props) {
  const [activeTab, setActiveTab] = useState<"today" | "users">("today");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [deptValue, setDeptValue] = useState("");

  const isAdmin = currentRole === "ADMIN";

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
          <h3 className="form-label text-lg mb-4">
            ユーザー一覧とロール管理
            {currentRole === "MANAGER" && currentDepartment && (
              <span style={{ fontSize: 13, color: 'var(--google-text-sub)', fontWeight: 400, marginLeft: 12 }}>
                （{currentDepartment}）
              </span>
            )}
          </h3>
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
    </>
  );
}
