"use client";

export default function Loading() {
  return (
    <div className="container animate-fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="loading-spinner" />
        <span className="text-muted text-sm">読み込み中...</span>
      </div>
    </div>
  );
}
