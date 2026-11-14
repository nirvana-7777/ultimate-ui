export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: 14, marginBottom: 8 }} />;
}

export function SkeletonLogo() {
  return <div className="skeleton" style={{ width: 70, height: 70, borderRadius: 14 }} />;
}

export function SkeletonPill() {
  return <div className="skeleton" style={{ width: '60%', height: 10, borderRadius: 5 }} />;
}
