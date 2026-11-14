import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, getConfig, ApiError } from '@/lib/api';
import { useTheme } from '@/hooks/useTheme';
import type { Theme } from '@/lib/theme';
import { useToast } from '@/lib/toast';
import { ProvidersPage } from './ProvidersPage';

const TABS = [
  { id: 'backend', label: 'Backend-Einstellungen' },
  { id: 'providers', label: 'EPG Provider' },
  { id: 'ui', label: 'UI-Einstellungen' },
  { id: 'player', label: 'Player-Einstellungen' },
  { id: 'advanced', label: 'Erweitert' },
] as const;

type TabId = (typeof TABS)[number]['id'];

type ConnState = 'idle' | 'testing' | 'connected' | 'error';

interface ConnStatus {
  state: ConnState;
  text: string;
}

function connClass(state: ConnState): string {
  return state === 'testing'
    ? 'testing'
    : state === 'connected'
    ? 'connected'
    : state === 'error'
    ? 'error'
    : '';
}

export function ConfigPage() {
  const config = getConfig();
  const [activeTab, setActiveTab] = useState<TabId>('backend');
  const { showToast } = useToast();
  const { setTheme } = useTheme();

  const [webepgStatus, setWebepgStatus] = useState<ConnStatus>({
    state: 'idle',
    text: 'Nicht getestet',
  });
  const [ultimateStatus, setUltimateStatus] = useState<ConnStatus>({
    state: 'idle',
    text: 'Nicht getestet',
  });

  const backendForm = useForm({
    defaultValues: {
      webepg_url: config.webepg.url,
      webepg_timeout: config.webepg.timeout,
      ultimate_backend_url: config.ultimate_backend.url,
      ultimate_backend_timeout: config.ultimate_backend.timeout,
    },
  });

  const uiForm = useForm({
    defaultValues: {
      ui_theme: config.ui.theme,
      timezone: config.ui.timezone,
      refresh_interval: config.ui.refresh_interval,
    },
  });

  const playerForm = useForm({
    defaultValues: {
      player_size: config.player.default_size,
      player_bitrate: config.player.default_bitrate,
      autoplay: config.player.autoplay ?? true,
      muted: config.player.muted ?? false,
      default_volume: config.player.default_volume ?? 50,
    },
  });

  const advancedForm = useForm({
    defaultValues: {
      retention_days: config.database.retention_days,
    },
  });

  const showServerWarnings = (data: any) => {
    if (Array.isArray(data?.warnings)) {
      data.warnings.forEach((w: string) => showToast(w, 'warning'));
    }
  };

  const saveAll = async () => {
    try {
      const b = backendForm.getValues();
      const u = uiForm.getValues();
      const p = playerForm.getValues();
      const a = advancedForm.getValues();
      const data = await api.post<any>('/config', {
        webepg_url: b.webepg_url,
        webepg_timeout: Number(b.webepg_timeout),
        ultimate_backend_url: b.ultimate_backend_url,
        ultimate_backend_timeout: Number(b.ultimate_backend_timeout),
        ui_theme: u.ui_theme,
        timezone: u.timezone,
        refresh_interval: Number(u.refresh_interval),
        player_size: p.player_size,
        player_bitrate: p.player_bitrate,
        autoplay: !!p.autoplay,
        muted: !!p.muted,
        default_volume: Number(p.default_volume),
        retention_days: Number(a.retention_days),
      });
      if (data?.success) {
        // Apply the saved theme in this browser too (it is stored per browser).
        setTheme(u.ui_theme as Theme);
        showToast('Konfiguration gespeichert!', 'success');
        showServerWarnings(data);
        // Give the user time to read env-override warnings before reloading.
        setTimeout(
          () => window.location.reload(),
          data.warnings?.length ? 4000 : 800
        );
      } else {
        showToast('Fehler: ' + (data?.error || data?.message || 'Unbekannt'), 'error');
      }
    } catch (e: any) {
      showToast('Fehler: ' + (e instanceof ApiError ? e.message : e.message), 'error');
    }
  };

  const resetAll = async () => {
    if (!confirm('Auf Standard zurücksetzen?')) return;
    try {
      const data = await api.post<any>('/config/reset');
      showToast('Konfiguration zurückgesetzt', 'success');
      showServerWarnings(data);
      setTimeout(
        () => window.location.reload(),
        data?.warnings?.length ? 4000 : 800
      );
    } catch (e: any) {
      showToast('Fehler beim Zurücksetzen: ' + e.message, 'error');
    }
  };

  const testWebEPG = async () => {
    setWebepgStatus({ state: 'testing', text: 'Teste Verbindung...' });
    try {
      const data = await api.get<any>('/api/test/webepg');
      if (data.success) {
        setWebepgStatus({
          state: 'connected',
          text: `Verbunden (${data.channels_count} Kanäle)`,
        });
        showToast(`WebEPG: ${data.channels_count} Kanäle`, 'success');
      } else {
        setWebepgStatus({ state: 'error', text: `Fehler: ${data.error || 'unbekannt'}` });
        showToast(`WebEPG Fehler: ${data.error}`, 'error');
      }
    } catch (e: any) {
      setWebepgStatus({ state: 'error', text: `Fehler: ${e.message}` });
      showToast(`WebEPG Fehler: ${e.message}`, 'error');
    }
  };

  const testUltimate = async () => {
    setUltimateStatus({ state: 'testing', text: 'Teste Verbindung...' });
    try {
      const data = await api.get<any>('/api/test/ultimate-backend');
      if (data.success) {
        setUltimateStatus({ state: 'connected', text: 'Verbindung erfolgreich' });
        showToast('Ultimate Backend Verbindung erfolgreich', 'success');
      } else {
        setUltimateStatus({ state: 'error', text: `Fehler: ${data.error || 'unbekannt'}` });
        showToast(`Ultimate Fehler: ${data.error}`, 'error');
      }
    } catch (e: any) {
      setUltimateStatus({ state: 'error', text: `Fehler: ${e.message}` });
      showToast(`Ultimate Fehler: ${e.message}`, 'error');
    }
  };

  return (
    <div className="config-container">
      <div className="config-header">
        <h2>Konfiguration</h2>
        <p className="config-subtitle">
          Einstellungen für Ultimate UI und Backend-Verbindungen
        </p>
      </div>

      <div className="config-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`config-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
            role="tab"
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'backend' && (
        <div className="config-section active">
          <h3>Backend-Verbindungen</h3>
          <form className="config-form">
            <div className="form-group">
              <h4>WebEPG Backend</h4>
              <div className="form-row">
                <div className="form-col">
                  <label>URL</label>
                  <input
                    className="form-input"
                    type="url"
                    {...backendForm.register('webepg_url')}
                  />
                </div>
                <div className="form-col">
                  <label>Timeout (Sekunden)</label>
                  <input
                    className="form-input"
                    type="number"
                    {...backendForm.register('webepg_timeout')}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-test" onClick={testWebEPG}>
                  Verbindung testen
                </button>
                <div className={`connection-status ${connClass(webepgStatus.state)}`}>
                  <span className="status-dot" />
                  <span className="status-text">{webepgStatus.text}</span>
                </div>
              </div>
            </div>
            <div className="form-group">
              <h4>Ultimate Backend</h4>
              <div className="form-row">
                <div className="form-col">
                  <label>URL</label>
                  <input
                    className="form-input"
                    type="url"
                    {...backendForm.register('ultimate_backend_url')}
                  />
                </div>
                <div className="form-col">
                  <label>Timeout (Sekunden)</label>
                  <input
                    className="form-input"
                    type="number"
                    {...backendForm.register('ultimate_backend_timeout')}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-test" onClick={testUltimate}>
                  Verbindung testen
                </button>
                <div className={`connection-status ${connClass(ultimateStatus.state)}`}>
                  <span className="status-dot" />
                  <span className="status-text">{ultimateStatus.text}</span>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'providers' && <ProvidersPage embedded />}

      {activeTab === 'ui' && (
        <div className="config-section active">
          <h3>UI-Einstellungen</h3>
          <form className="config-form">
            <div className="form-row">
              <div className="form-col">
                <label>Theme</label>
                <select className="form-select" {...uiForm.register('ui_theme')}>
                  <option value="light">Hell</option>
                  <option value="dark">Dunkel</option>
                  <option value="auto">System</option>
                </select>
              </div>
              <div className="form-col">
                <label>Zeitzone</label>
                <select className="form-select" {...uiForm.register('timezone')}>
                  <option value="Europe/Berlin">Europa/Berlin (MEZ)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                </select>
              </div>
            </div>
            <div className="form-col">
              <label>Auto-Refresh (Sekunden)</label>
              <input
                className="form-input"
                type="number"
                {...uiForm.register('refresh_interval')}
              />
            </div>
          </form>
        </div>
      )}

      {activeTab === 'player' && (
        <div className="config-section active">
          <h3>Player-Einstellungen</h3>
          <form className="config-form">
            <div className="form-row">
              <div className="form-col">
                <label>Standard-Größe</label>
                <select className="form-select" {...playerForm.register('player_size')}>
                  <option value="small">Klein</option>
                  <option value="medium">Mittel</option>
                  <option value="large">Groß</option>
                </select>
              </div>
              <div className="form-col">
                <label>Standard-Bitrate</label>
                <select
                  className="form-select"
                  {...playerForm.register('player_bitrate')}
                >
                  <option value="auto">Automatisch</option>
                  <option value="1000000">Bis 1 Mbit</option>
                  <option value="3000000">Bis 3 Mbit</option>
                  <option value="6000000">Bis 6 Mbit</option>
                </select>
              </div>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="config-section active">
          <h3>Erweiterte Einstellungen</h3>
          <form className="config-form">
            <div className="form-col">
              <label>Aufbewahrungsdauer (Tage)</label>
              <input
                className="form-input"
                type="number"
                {...advancedForm.register('retention_days')}
              />
            </div>
          </form>
        </div>
      )}

      <div className="config-actions">
        <button className="btn-save" onClick={saveAll}>
          Alle Einstellungen speichern
        </button>
        <button
          className="btn-reset"
          onClick={resetAll}
        >
          Auf Standard zurücksetzen
        </button>
      </div>

      <div className="config-info">
        <h4>Konfigurationsdatei</h4>
        <p>
          <strong>Speicherort:</strong> <code>config/config.yaml</code>
        </p>
      </div>
    </div>
  );
}
