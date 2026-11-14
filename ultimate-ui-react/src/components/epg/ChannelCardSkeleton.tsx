export function ChannelCardSkeleton() {
  return (
    <div className="channel-now-card" style={{ cursor: 'default' }}>
      <div className="channel-header-compact">
        <div className="channel-logo-section">
          <div className="skeleton" style={{ width: 70, height: 70, borderRadius: 14 }} />
          <div className="skeleton" style={{ width: 70, height: 12, marginTop: 8 }} />
        </div>
        <div className="channel-info-compact" style={{ paddingRight: 130 }}>
          <div className="skeleton" style={{ height: 20, width: '75%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 14, width: '50%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 12, width: '65%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 12, width: '60%' }} />
        </div>
        <div className="skeleton" style={{ width: 120, height: 90, borderRadius: 8 }} />
      </div>
    </div>
  );
}
