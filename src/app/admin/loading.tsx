"use client";

export default function AdminLoading() {
  return (
    <div className="container animate-fade-in">
      {/* タブバー */}
      <div className="card" style={{ padding: "12px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {["勤務状況", "残業ヒートマップ", "ユーザー管理", "祝日管理"].map((t, i) => (
            <div key={i} style={{
              padding: "10px 20px", borderRadius: 100,
              backgroundColor: i === 0 ? "var(--google-primary-light)" : "transparent",
              color: i === 0 ? "var(--google-primary)" : "var(--google-text-sub)",
              fontSize: 14, fontWeight: 500,
            }}>{t}</div>
          ))}
        </div>
      </div>

      {/* テーブルスケルトン */}
      <div className="card">
        <div style={{ marginBottom: 16 }}>
          <div className="skeleton" style={{ width: 160, height: 20, borderRadius: 100 }} />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["社員番号", "氏名", "出勤", "退勤", "経過", "労働", "残業", "ステータス"].map((h, i) => (
                <th key={i} style={{
                  padding: "12px 20px", textAlign: "left", fontSize: 12,
                  fontWeight: 600, color: "var(--google-text-sub)",
                  borderBottom: "1px solid var(--google-border-light)",
                  textTransform: "uppercase", letterSpacing: 0.5,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <td key={j} style={{ padding: "14px 20px", borderBottom: "1px solid var(--google-border-light)" }}>
                    <div className="skeleton" style={{
                      width: j === 1 ? 100 : j === 7 ? 60 : 50,
                      height: 16, borderRadius: 100,
                    }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
