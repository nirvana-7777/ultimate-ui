export function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        textAlign: 'center',
        padding: '80px 20px',
        color: 'var(--text-muted)',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📭</div>
      <p style={{ fontSize: 15 }}>{message}</p>
    </div>
  );
}
