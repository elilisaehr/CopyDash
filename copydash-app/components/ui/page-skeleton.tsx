// Instant placeholder shown by the route groups' loading.tsx while a page's
// data is fetched — mirrors PageHeader's padding so nothing jumps on swap-in.
export function PageSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }} aria-busy="true" aria-label="Loading">
      <div style={{ padding: "40px 48px 32px", borderBottom: "1px solid #e4e4e7", background: "#fff", flexShrink: 0 }}>
        <div className="skeleton" style={{ width: 220, height: 28, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: 320, height: 14 }} />
      </div>
      <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12 }} />
          ))}
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 52, borderRadius: 10 }} />
        ))}
      </div>
    </div>
  );
}
