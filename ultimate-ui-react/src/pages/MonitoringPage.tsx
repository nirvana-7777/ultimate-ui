import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { monitoringService } from '@/services/monitoringService';
import { useToast } from '@/lib/toast';

export function MonitoringPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState('--:--:--');
  const { showToast } = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const d = await monitoringService.getStatus();
      setData(d);
    } catch (e: any) {
      showToast(`Fehler: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!data?.import_status?.next_scheduled_import) return;
    const target = new Date(data.import_status.next_scheduled_import).getTime();
    const update = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setCountdown('Jetzt');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [data]);

  const stats = data?.statistics || {};
  const imports = data?.import_status?.recent_imports || [];

  return (
    <div className="monitoring-container">
      <div className="monitoring-header">
        <h2>System Monitoring</h2>
        <p className="monitoring-subtitle">
          Überwachung aller Backend-Dienste und Import-Statistiken
        </p>
      </div>

      <div className="health-cards">
        <div className="health-card">
          <div className="health-card-header">
            <h3>WebEPG Backend</h3>
            <span
              className={`health-status ${
                data?.webepg_health ? 'online' : 'offline'
              }`}
            >
              {data?.webepg_health ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="health-card-body">
            <div className="health-info">
              <span className="health-label">Status</span>
              <span className="health-value">
                {data?.webepg_health ? 'Verbunden' : 'Nicht erreichbar'}
              </span>
            </div>
            <div className="health-actions">
              <button
                className="btn-health-check"
                onClick={async () => {
                  try {
                    const r = await monitoringService.testWebEPG();
                    showToast(
                      r.success ? `${r.channels_count} Kanäle` : r.error,
                      r.success ? 'success' : 'error'
                    );
                    refresh();
                  } catch (e: any) {
                    showToast(e.message, 'error');
                  }
                }}
              >
                Health Check
              </button>
            </div>
          </div>
        </div>

        <div className="health-card">
          <div className="health-card-header">
            <h3>Ultimate Backend</h3>
            <span className="health-status online">Online</span>
          </div>
          <div className="health-card-body">
            <div className="health-info">
              <span className="health-label">Provider</span>
              <span className="health-value">{stats.total_providers || '0'}</span>
            </div>
            <div className="health-actions">
              <button
                className="btn-trigger-import"
                onClick={async () => {
                  if (!confirm('Import-Job starten?')) return;
                  try {
                    await monitoringService.triggerImport();
                    showToast('Import gestartet', 'success');
                  } catch (e: any) {
                    showToast(e.message, 'error');
                  }
                }}
              >
                Import starten
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="statistics-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <h3>Datenbank-Statistiken</h3>
            <button className="btn-refresh-stats" onClick={refresh}>
              ⟳
            </button>
          </div>
          <div className="stat-card-body">
            <div className="stat-row">
              <div className="stat-item">
                <span className="stat-label">Kanäle</span>
                <span className="stat-value">{stats.total_channels || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Programme</span>
                <span className="stat-value">{stats.total_programs || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Provider</span>
                <span className="stat-value">{stats.total_providers || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Tage</span>
                <span className="stat-value">{stats.days_covered || 0}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <h3>Import-Status</h3>
          </div>
          <div className="stat-card-body">
            <div className="stat-item">
              <span className="stat-label">Erfolgreich</span>
              <span className="stat-value success">
                {imports.filter((i: any) => i.status === 'success').length}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Fehlgeschlagen</span>
              <span className="stat-value error">
                {imports.filter((i: any) => i.status === 'failed').length}
              </span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <h3>Nächster Import</h3>
          </div>
          <div className="stat-card-body">
            <div className="countdown">
              <span className="countdown-value">{countdown}</span>
              <span className="countdown-label">Verbleibend</span>
            </div>
          </div>
        </div>
      </div>

      <div className="recent-imports">
        <div className="section-header">
          <h3>Letzte Importe</h3>
        </div>
        <div className="imports-table-container">
          <table className="imports-table">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Importiert</th>
                <th>Übersprungen</th>
              </tr>
            </thead>
            <tbody>
              {imports.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}
                  >
                    Keine Importe gefunden
                  </td>
                </tr>
              ) : (
                imports.slice(0, 10).map((imp: any) => (
                  <motion.tr
                    key={imp.id}
                    className={`import-row status-${imp.status}`}
                    whileHover={{ backgroundColor: 'var(--surface-2)' }}
                  >
                    <td className="import-time">
                      {new Date(imp.started_at).toLocaleString('de-DE')}
                    </td>
                    <td>Provider #{imp.provider_id}</td>
                    <td>
                      <span className={`status-badge status-${imp.status}`}>
                        {imp.status.toUpperCase()}
                      </span>
                    </td>
                    <td>{imp.programs_imported || 0}</td>
                    <td>{imp.programs_skipped || 0}</td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
