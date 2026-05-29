"use client";

import { useState, useTransition } from "react";
import { updateUserRole } from "@/app/actions";
import { formatTime } from "@/lib/attendanceCalc";

type TodayEntry = {
  id: string;
  name: string;
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
};

type Props = {
  todayData: TodayEntry[];
  allUsers: UserEntry[];
};

export default function AdminClient({ todayData, allUsers }: Props) {
  const [activeTab, setActiveTab] = useState<"today" | "users">("today");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleRoleChange = (userId: string, currentRole: string) => {
    const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";
    setFeedback(null);
    startTransition(async () => {
      const result = await updateUserRole(userId, newRole);
      if (result.error) {
        setFeedback(`エラー: ${result.error}`);
      } else {
        setFeedback("ロールを更新しました");
      }
    });
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
          <h3 className="form-label text-lg mb-4">本日の出退勤と勤務時間</h3>
          <table className="data-table mt-4">
            <thead>
              <tr>
                <th>社員名</th>
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
                  <td colSpan={6} className="text-center text-muted" style={{ padding: '24px 0' }}>
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
          <h3 className="form-label text-lg mb-4">ユーザー一覧とロール管理</h3>
          <table className="data-table mt-4">
            <thead>
              <tr>
                <th>名前</th>
                <th>メールアドレス</th>
                <th>ロール</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 'bold' }}>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span
                      className="status-card"
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor: user.role === 'ADMIN' ? '#D3E3FD' : '#F0F4F9',
                        color: user.role === 'ADMIN' ? 'var(--google-primary)' : 'var(--google-text-sub)',
                      }}
                    >
                      {user.role === 'ADMIN' ? '管理者' : '一般ユーザー'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-primary"
                      style={{ width: 'auto', padding: '6px 16px', fontSize: '13px' }}
                      onClick={() => handleRoleChange(user.id, user.role)}
                      disabled={isPending}
                    >
                      {isPending ? '更新中...' : user.role === 'ADMIN' ? 'USERに変更' : 'ADMINに変更'}
                    </button>
                  </td>
                </tr>
              ))}

              {allUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted" style={{ padding: '24px 0' }}>
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
