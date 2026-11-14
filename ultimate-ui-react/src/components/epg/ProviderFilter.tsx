interface Props {
  providers: any[];
  value: string;
  onChange: (value: string) => void;
}

export function ProviderFilter({ providers, value, onChange }: Props) {
  return (
    <div className="provider-filter">
      <label htmlFor="provider-select-epg">Filter nach Provider:</label>
      <select
        id="provider-select-epg"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Alle EPG Kanäle</option>
        {providers.map((p) => (
          <option key={p.name || p.id} value={p.name || p.id}>
            {p.label || p.name || `Provider ${p.id}`}
          </option>
        ))}
      </select>
    </div>
  );
}
