import type { ReactNode } from 'react';

/** Empty / loading / error placeholder shared by all three EPG columns. */
export function ColumnState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="col-state">
      <div className="col-state-icon" aria-hidden="true">
        {icon}
      </div>
      <p className="col-state-title">{title}</p>
      {hint && <p className="col-state-hint">{hint}</p>}
      {action}
    </div>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="col-skeleton" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}
