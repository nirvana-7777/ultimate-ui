import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';

const TABS = [
  { to: '/', icon: '📋', label: 'EPG' },
  { to: '/events', icon: '🏟️', label: 'Events' },
  { to: '/vod', icon: '🎬', label: 'VOD' },
  { to: '/recordings', icon: '⏺️', label: 'Recordings' },
  { to: '/mapping', icon: '🔗', label: 'Mapping' },
  { to: '/monitoring', icon: '📊', label: 'Monitoring' },
  { to: '/config', icon: '⚙️', label: 'Konfiguration' },
];

export function Header() {
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
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
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent('ultimate:refresh'));
    setTimeout(() => setRefreshing(false), 800);
  };

  const clock = `${now.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })} ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <span className="logo-icon">📺</span>
          <span className="logo-text">Ultimate UI</span>
        </Link>

        <nav className="header-tabs" aria-label="Hauptnavigation">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) => `header-tab ${isActive ? 'active' : ''}`}
              title={t.label}
            >
              <span className="header-tab-icon" aria-hidden="true">
                {t.icon}
              </span>
              <span className="header-tab-label">{t.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <span
            className="header-status"
            title={
              backendOnline === null
                ? 'WebEPG: prüfe…'
                : backendOnline
                ? 'WebEPG: online'
                : 'WebEPG: offline'
            }
          >
            <span
              className={`status-dot ${
                backendOnline === null ? '' : backendOnline ? 'online' : 'offline'
              }`}
              aria-hidden="true"
            />
            <span className="header-status-label">WebEPG</span>
          </span>
          <span className="header-clock">{clock}</span>
          <motion.button
            className="btn-refresh"
            onClick={handleRefresh}
            title="Aktualisieren"
            aria-label="Aktualisieren"
            animate={reduced ? {} : { rotate: refreshing ? 360 : 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          >
            🔄
          </motion.button>
        </div>
      </div>
    </header>
  );
}
