"use client";

export default function SummaryLoading() {
  return (
    <div className="container animate-fade-in">
      {/* ヘッダーカード */}
      <div className="card no-print" style={{ marginBottom: 16, padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div className="skeleton" style={{ width: 160, height: 36, borderRadius: 100 }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 100 }} />
            <div className="skeleton" style={{ width: 140, height: 36, borderRadius: 100 }} />
            <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 100 }} />
          </div>
          <div className="skeleton" style={{ width: 80, height: 36, borderRadius: 100 }} />
        </div>
      </div>

      {/* 月別サマリーカード */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {[1, 2].map(i => (
          <div key={i} className="card" style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {Array.from({ length: 8 }).map((_, j) => (
                <div key={j} style={{ textAlign: "center" }}>
                  <div className="skeleton" style={{ width: "80%", height: 12, borderRadius: 100, margin: "0 auto 6px" }} />
                  <div className="skeleton" style={{ width: "60%", height: 18, borderRadius: 100, margin: "0 auto" }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 日別データカード */}
      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <div className="skeleton" style={{ width: 200, height: 18, borderRadius: 100 }} />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["日付", "曜日/祝", "出勤", "退勤", "休憩", "所定", "残業(8h超)", "深夜所定", "深夜残業", "備考"].map((h, i) => (
                <th key={i} style={{
                  padding: "12px 16px", textAlign: "left", fontSize: 12,
                  fontWeight: 600, color: "var(--google-text-sub)",
                  borderBottom: "1px solid var(--google-border-light)",
                  textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 15 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 10 }).map((_, j) => (
                  <td key={j} style={{ padding: "10px 16px", borderBottom: "1px solid var(--google-border-light)" }}>
                    <div className="skeleton" style={{
                      width: j === 0 ? 50 : j === 1 ? 30 : j === 9 ? 60 : 45,
                      height: 14, borderRadius: 100,
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
