import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';

const NAV = [
  { to: '/', icon: '📋', label: 'EPG Anzeige', tab: 'epg' },
  { to: '/config', icon: '⚙️', label: 'Konfiguration', tab: 'config' },
  { to: '/mapping', icon: '🔗', label: 'EPG Mapping', tab: 'mapping' },
  { to: '/monitoring', icon: '📊', label: 'Monitoring', tab: 'monitoring' },
];

export function Sidebar({
  mobileOpen,
  onNavigate,
}: {
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const [now, setNow] = useState(new Date());
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/monitoring/status');
        const data = await r.json();
        setBackendOnline(!!data.webepg_health);
      } catch {
        setBackendOnline(false);
      }
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, []);

  const timeStr = now.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateStr = now.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });

  return (
    <nav
      className={`sidebar ${mobileOpen ? 'active' : ''}`}
      aria-label="Hauptnavigation"
    >
      <div className="nav-items">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'active' : ''}`
            }
            end={item.to === '/'}
          >
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="nav-text">{item.label}</span>
          </NavLink>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="backend-status">
          <span className="status-label">WebEPG:</span>
          <span
            className={`status-dot ${
              backendOnline === null ? '' : backendOnline ? 'online' : 'offline'
            }`}
            aria-hidden="true"
          />
        </div>
        <div className="current-time">
          {dateStr} {timeStr}
        </div>
      </div>
    </nav>
  );
}
