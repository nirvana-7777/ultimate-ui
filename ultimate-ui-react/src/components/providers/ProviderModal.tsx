import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '@/components/ui/Modal';
import { providersService } from '@/services/providersService';
import { useToast } from '@/lib/toast';
import type { Provider } from '@/lib/types';

interface Props {
  open: boolean;
  provider?: Provider | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormData {
  name: string;
  xmltv_url: string;
  enabled: boolean;
}

export function ProviderModal({ open, provider, onClose, onSaved }: Props) {
  const isEdit = !!provider;
  const { register, handleSubmit, reset, watch, formState } = useForm<FormData>({
    defaultValues: {
      name: provider?.name ?? '',
      xmltv_url: provider?.xmltv_url ?? '',
      enabled: provider?.enabled ?? true,
    },
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    reset({
      name: provider?.name ?? '',
      xmltv_url: provider?.xmltv_url ?? '',
      enabled: provider?.enabled ?? true,
    });
  }, [provider, reset, open]);

  const testConnection = async () => {
    // watch() reads the live form value; no DOM escape hatch needed.
    const url = watch('xmltv_url');
    if (!url) {
      showToast('Bitte zuerst eine URL eingeben', 'warning');
      return;
    }
    setTesting(true);
    try {
      if (provider) {
        const r = await providersService.test(provider.id);
        showToast(
          r.success ? 'Verbindung OK' : `Fehler: ${r.message || 'Unbekannt'}`,
          r.success ? 'success' : 'error'
        );
      } else {
        // HEAD to arbitrary URL: will fail on CORS for cross-origin, which
        // is a valid signal but not a definitive "URL broken". Backend
        // proxy endpoint would be cleaner (see "Not in this set").
        const r = await fetch(url, { method: 'HEAD' });
        showToast(
          r.ok ? 'URL erreichbar' : `Fehler: HTTP ${r.status}`,
          r.ok ? 'success' : 'error'
        );
      }
    } catch (e: any) {
      showToast(
        `Fehler: ${e.message} (CORS oder Netzwerk)`,
        'error'
      );
    } finally {
      setTesting(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      if (provider) {
        await providersService.update(provider.id, data);
        showToast('Provider aktualisiert', 'success');
      } else {
        await providersService.create(data);
        showToast('Provider erstellt', 'success');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      showToast(`Fehler: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={520}>
      <div className="modal-header">
        <h3>{isEdit ? 'Provider bearbeiten' : 'Neuen Provider hinzufügen'}</h3>
        <button className="modal-close" onClick={onClose} aria-label="Schließen">
          ×
        </button>
      </div>
      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div>
          <label
            htmlFor="name"
            style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}
          >
            Provider Name *
          </label>
          <input
            id="name"
            className="form-input"
            {...register('name', { required: true, minLength: 1 })}
            placeholder="z.B. Meine EPG Quelle"
          />
        </div>
        <div>
          <label
            htmlFor="xmltv_url"
            style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}
          >
            XMLTV URL *
          </label>
          <input
            id="xmltv_url"
            className="form-input"
            type="url"
            {...register('xmltv_url', { required: true })}
            placeholder="https://example.com/epg.xml"
          />
          <small
            style={{
              color: 'var(--text-muted)',
              fontSize: 12,
              marginTop: 4,
              display: 'block',
            }}
          >
            Vollständige URL zur XMLTV-Datei
          </small>
        </div>
        <label
          className="checkbox-label"
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        >
          <input type="checkbox" {...register('enabled')} />
          <span className="checkmark" />
          Provider aktivieren (automatischer Import)
        </label>
        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
            marginTop: 8,
          }}
        >
          <button
            type="button"
            className="btn-test"
            onClick={testConnection}
            disabled={testing}
          >
            {testing ? 'Teste...' : 'Verbindung testen'}
          </button>
          <button type="button" className="btn-date" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn-save" disabled={saving || formState.isSubmitting}>
            {saving ? 'Speichere...' : isEdit ? 'Speichern' : 'Erstellen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
