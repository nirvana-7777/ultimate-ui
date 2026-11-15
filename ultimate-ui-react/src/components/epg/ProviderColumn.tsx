import type { ProviderItem } from '@/hooks/useProviders';
import { ColumnState, ListSkeleton } from './ColumnState';

interface Props {
  providers: ProviderItem[];
  loading: boolean;
  selected: string | null;
  onSelect: (key: string) => void;
}

export function ProviderColumn({ providers, loading, selected, onSelect }: Props) {
  return (
    <section className="epg-col epg-col-providers" aria-label="Provider">
      <header className="epg-col-header">
        <h2>Provider</h2>
        {!loading && <span className="epg-col-count">{providers.length}</span>}
      </header>
      <div className="epg-col-scroll">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : providers.length === 0 ? (
          <ColumnState icon="🔌" title="Keine Provider" hint="Provider im WebEPG anlegen." />
        ) : (
          <ul className="epg-list" role="listbox" aria-label="Provider">
            {providers.map((p) => (
              <li key={p.key}>
                <button
                  role="option"
                  aria-selected={p.key === selected}
                  className={`epg-item ${p.key === selected ? 'selected' : ''}`}
                  onClick={() => onSelect(p.key)}
                >
                  <span className="provider-avatar" aria-hidden="true">
                    {p.label.substring(0, 2).toUpperCase()}
                  </span>
                  <span className="epg-item-title">{p.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
