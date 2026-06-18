"use client";

export default function HomeLoading() {
  return (
    <div className="container animate-fade-in" style={{ maxWidth: 600, margin: "0 auto", paddingTop: 40 }}>
      <div className="card" style={{ textAlign: "center", padding: "48px 28px" }}>
        <div className="skeleton" style={{ width: 200, height: 24, borderRadius: 100, margin: "0 auto 24px" }} />
        <div className="skeleton" style={{ width: 120, height: 48, borderRadius: 100, margin: "0 auto 32px" }} />
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <div className="skeleton" style={{ width: 160, height: 80, borderRadius: 20 }} />
          <div className="skeleton" style={{ width: 160, height: 80, borderRadius: 20 }} />
        </div>
      </div>
    </div>
  );
}
