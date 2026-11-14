import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { providersService } from '@/services/providersService';
import { useToast } from '@/lib/toast';
import { ProviderModal } from '@/components/providers/ProviderModal';
import type { Provider, ImportLog } from '@/lib/types';

export function ProvidersPage({ embedded = false }: { embedded?: boolean }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [p, l] = await Promise.all([
        providersService.list(),
        providersService.importLogs(),
      ]);
      setProviders(p);
      setLogs(l);
    } catch (e: any) {
      showToast(`Fehler: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = providers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const total = providers.length;
  const enabled = providers.filter((p) => p.enabled).length;
  const disabled = total - enabled;
  const successCount = logs.filter((l) => l.status === 'success').length;
  const rate = logs.length > 0 ? Math.round((successCount / logs.length) * 100) : 0;

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (p: Provider) => {
    setEditing(p);
    setModalOpen(true);
  };

  const content = (
    <>
      {!embedded && (
        <div className="providers-header">
          <h2>EPG Provider Management</h2>
          <p className="providers-subtitle">
            Verwalten Sie Ihre EPG-Datenquellen
          </p>
        </div>
      )}
      <div className="stats-container">
        <div className="stat-card">
          <div className="stat-icon">📡</div>
          <div className="stat-content">
            <h3>{total}</h3>
            <p>Total Providers</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>{enabled}</h3>
            <p>Enabled</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <h3>{disabled}</h3>
            <p>Disabled</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>{rate}%</h3>
            <p>Success Rate</p>
          </div>
        </div>
      </div>

      <div className="providers-actions">
        <button className="btn-add-provider" onClick={openAdd}>
          <span className="btn-icon">+</span> Provider hinzufügen
        </button>
        <button className="btn-secondary" onClick={load}>
          <span className="btn-icon">⟳</span> Aktualisieren
        </button>
      </div>

      <div className="providers-table-container">
        <div className="table-header">
          <h3>EPG Providers</h3>
          <input
            type="text"
            placeholder="Provider suchen..."
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Lade Provider...
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📡</div>
            <h3>Keine EPG Provider</h3>
            <p>Fügen Sie Ihren ersten Provider hinzu.</p>
            <button className="btn-add-provider" onClick={openAdd}>
              <span className="btn-icon">+</span> Ersten Provider hinzufügen
            </button>
          </div>
        ) : (
          <table className="providers-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>XMLTV URL</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <motion.tr
                  key={p.id}
                  whileHover={{ backgroundColor: 'var(--surface-2)' }}
                >
                  <td>
                    <div className="provider-status">
                      <span
                        className={`status-dot ${p.enabled ? 'enabled' : 'disabled'}`}
                      />
                      <span className="status-text">
                        {p.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>
                    <div className="provider-url">
                      <span className="url-text" title={p.xmltv_url}>
                        {p.xmltv_url?.substring(0, 40)}
                        {(p.xmltv_url?.length || 0) > 40 ? '...' : ''}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="provider-actions">
                      <button className="action-btn edit" onClick={() => openEdit(p)} title="Bearbeiten">
                        ✏️
                      </button>
                      <button
                        className="action-btn test"
                        onClick={async () => {
                          try {
                            const r = await providersService.test(p.id);
                            showToast(
                              r.success ? 'Verbindung OK' : 'Verbindung fehlgeschlagen',
                              r.success ? 'success' : 'error'
                            );
                          } catch (e: any) {
                            showToast(`Fehler: ${e.message}`, 'error');
                          }
                        }}
                        title="Testen"
                      >
                        🔍
                      </button>
                      <button
                        className="action-btn import"
                        onClick={async () => {
                          try {
                            await providersService.triggerImport(p.id);
                            showToast('Import gestartet', 'success');
                            setTimeout(load, 2000);
                          } catch (e: any) {
                            showToast(`Fehler: ${e.message}`, 'error');
                          }
                        }}
                        title="Import"
                      >
                        🔄
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={async () => {
                          if (confirm(`Provider "${p.name}" löschen?`)) {
                            try {
                              await providersService.remove(p.id);
                              showToast('Gelöscht', 'success');
                              load();
                            } catch (e: any) {
                              showToast(`Fehler: ${e.message}`, 'error');
                            }
                          }
                        }}
                        title="Löschen"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ProviderModal
        open={modalOpen}
        provider={editing}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </>
  );

  if (embedded) return <div className="config-section active">{content}</div>;
  return <div className="providers-container">{content}</div>;
}
