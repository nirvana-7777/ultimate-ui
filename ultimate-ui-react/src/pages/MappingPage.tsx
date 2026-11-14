import { useEffect, useState } from 'react';
import { mappingService } from '@/services/mappingService';
import { FuzzySet } from '@/lib/fuzzyset';
import { useToast } from '@/lib/toast';
import { motion } from 'motion/react';

interface StreamingChannel {
  Id?: string | number;
  Name?: string;
  LogoUrl?: string;
  [key: string]: any;
}

interface EPGChannel {
  id?: string | number;
  identifier?: string;
  display_name?: string;
  name?: string;
  [key: string]: any;
}

interface AliasInfo {
  aliasId: number;
  epgChannelId: string;
  epgChannelName: string;
  alias: string;
}

export function MappingPage() {
  const { showToast } = useToast();
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [streamingChannels, setStreamingChannels] = useState<StreamingChannel[]>([]);
  const [epgChannels, setEpgChannels] = useState<EPGChannel[]>([]);
  const [aliases, setAliases] = useState<Map<string, AliasInfo>>(new Map());
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<'streaming' | 'epg' | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [tentativeMatches, setTentativeMatches] = useState<Map<string, { score: number; matchName: string }>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const data = await mappingService.listProviders();
        const list = data.providers?.providers || data.providers || [];
        setProviders(list);
        if (list.length > 0) {
          const first = list[0].name || list[0].id;
          setSelectedProvider(String(first));
        }
      } catch (e: any) {
        showToast(`Fehler: ${e.message}`, 'error');
      }
    })();
    (async () => {
      try {
        const ch = await mappingService.listEPGChannels();
        setEpgChannels(Array.isArray(ch) ? ch : []);
      } catch (e: any) {
        showToast(`Fehler EPG: ${e.message}`, 'error');
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedProvider) return;
    (async () => {
      try {
        const data = await mappingService.listProviderChannels(selectedProvider);
        const ch = data.channels?.channels || data.channels || [];
        setStreamingChannels(Array.isArray(ch) ? ch : []);
        await loadAliases();
      } catch (e: any) {
        showToast(`Fehler: ${e.message}`, 'error');
      }
    })();
  }, [selectedProvider]);

  const loadAliases = async () => {
    try {
      const data = await mappingService.listAliases();
      const list = data?.aliases || [];
      const map = new Map<string, AliasInfo>();
      list.forEach((a: any) => {
        map.set(a.alias, {
          aliasId: a.id,
          epgChannelId: String(a.channel_id),
          epgChannelName: a.channel_display_name || `Channel ${a.channel_id}`,
          alias: a.alias,
        });
      });
      setAliases(map);
    } catch {}
  };

  // Fuzzy matching
  useEffect(() => {
    if (epgChannels.length === 0 || streamingChannels.length === 0) return;
    const names = epgChannels
      .map((c) => c.display_name || c.name || String(c.id))
      .filter(Boolean) as string[];
    const fuzzy = new FuzzySet(names);
    const tentative = new Map<string, { score: number; matchName: string }>();
    streamingChannels.forEach((s) => {
      const sid = String(s.Id ?? s.name);
      if (aliases.has(sid)) return;
      const results = fuzzy.get(s.Name || '');
      if (results.length > 0 && results[0][0] >= 0.7) {
        tentative.set(sid, {
          score: Math.round(results[0][0] * 100),
          matchName: results[0][1],
        });
      }
    });
    setTentativeMatches(tentative);
  }, [epgChannels, streamingChannels, aliases]);

  const handleDragStart = (type: 'streaming' | 'epg', id: string) => {
    setDragging(id);
    setDraggingType(type);
  };
  const handleDragEnd = () => {
    setDragging(null);
    setDraggingType(null);
    setDragOverId(null);
  };
  const handleDrop = async (streamingId: string) => {
    if (!dragging || draggingType !== 'epg') {
      handleDragEnd();
      return;
    }
    const epgId = dragging;
    const streamingChannel = streamingChannels.find(
      (s) => String(s.Id ?? s.name) === streamingId
    );
    const epgChannel = epgChannels.find(
      (c) => String(c.id ?? c.identifier ?? c.name) === epgId
    );
    if (!streamingChannel || !epgChannel) {
      handleDragEnd();
      return;
    }
    const existing = aliases.get(streamingId);
    if (existing) {
      if (!confirm(`Überschreiben? Bereits verlinkt mit "${existing.epgChannelName}".`)) {
        handleDragEnd();
        return;
      }
      try {
        await mappingService.deleteAlias(existing.aliasId);
      } catch {}
    }
    try {
      const result = await mappingService.createAlias(
        epgId,
        streamingId,
        'ultimate_backend'
      );
      const newAlias: AliasInfo = {
        aliasId: result.alias?.id,
        epgChannelId: epgId,
        epgChannelName:
          epgChannel.display_name || epgChannel.name || String(epgId),
        alias: streamingId,
      };
      setAliases(new Map(aliases).set(streamingId, newAlias));
      showToast('Mapping erstellt', 'success');
    } catch (e: any) {
      showToast(`Fehler: ${e.message}`, 'error');
    } finally {
      handleDragEnd();
    }
  };

  const handleUnmap = async (streamingId: string) => {
    const alias = aliases.get(streamingId);
    if (!alias) return;
    if (!confirm(`Unmappen von "${alias.epgChannelName}"?`)) return;
    try {
      await mappingService.deleteAlias(alias.aliasId);
      const next = new Map(aliases);
      next.delete(streamingId);
      setAliases(next);
      showToast('Mapping entfernt', 'success');
    } catch (e: any) {
      showToast(`Fehler: ${e.message}`, 'error');
    }
  };

  const filteredEPG = epgChannels.filter((c) => {
    const name = (c.display_name || c.name || '').toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="epg-mapping-container">
      <div className="mapping-header">
        <h2 className="page-title">EPG Channel Mapping</h2>
        <p className="page-description">
          Ziehen Sie EPG-Kanäle auf Streaming-Kanäle, um Mappings zu erstellen.
          Gemappte Kanäle erscheinen grün. Orange = Tentative Match (klicken zum Bestätigen).
        </p>
      </div>

      <div className="mapping-area">
        <div className="column">
          <div className="column-header">
            <h3>Streaming Channels</h3>
            <div className="provider-selector">
              <label>Provider:</label>
              <select
                className="provider-dropdown"
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.name || p.id} value={p.name || p.id}>
                    {p.label || p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="channels-container">
            {streamingChannels.map((s) => {
              const sid = String(s.Id ?? s.name);
              const alias = aliases.get(sid);
              const tentative = tentativeMatches.get(sid);
              const isMapped = !!alias;
              const isDragOver = dragOverId === sid;
              return (
                <motion.div
                  key={sid}
                  className={`channel-card ${isMapped ? 'mapped' : ''} ${
                    tentative ? 'tentative' : ''
                  } ${isDragOver ? 'drag-over' : ''}`}
                  onDragOver={(e) => {
                    if (draggingType === 'epg') {
                      e.preventDefault();
                      setDragOverId(sid);
                    }
                  }}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(sid);
                  }}
                  onClick={async () => {
                    if (tentative && !isMapped) {
                      const epg = epgChannels.find(
                        (c) =>
                          (c.display_name || c.name) === tentative.matchName
                      );
                      if (epg) {
                        const epgId = String(epg.id ?? epg.identifier ?? epg.name);
                        try {
                          const result = await mappingService.createAlias(
                            epgId,
                            sid,
                            'ultimate_backend'
                          );
                          const newAlias: AliasInfo = {
                            aliasId: result.alias?.id,
                            epgChannelId: epgId,
                            epgChannelName: tentative.matchName,
                            alias: sid,
                          };
                          setAliases(new Map(aliases).set(sid, newAlias));
                          showToast('Bestätigt', 'success');
                        } catch (e: any) {
                          showToast(`Fehler: ${e.message}`, 'error');
                        }
                      }
                    }
                  }}
                  layout
                >
                  <div className="channel-logo">
                    {s.LogoUrl ? (
                      <img src={s.LogoUrl} alt={s.Name} />
                    ) : (
                      <div className="channel-logo-fallback">
                        {(s.Name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="channel-info">
                    <div className="channel-name">{s.Name || sid}</div>
                    <div className="channel-id">{sid}</div>
                    {alias && (
                      <div className="channel-mapping">
                        Linked to: {alias.epgChannelName}
                      </div>
                    )}
                    {tentative && !isMapped && (
                      <div className="channel-suggestion">
                        <div className="suggestion-match">
                          Suggested: {tentative.matchName}
                        </div>
                        <div className="suggestion-confidence">
                          {tentative.score}% match
                        </div>
                      </div>
                    )}
                  </div>
                  {isMapped && (
                    <button
                      className="unmap-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnmap(sid);
                      }}
                      title="Unmap"
                    >
                      ×
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="column">
          <div className="column-header">
            <h3>EPG Channels</h3>
            <div className="epg-controls">
              <input
                type="text"
                className="search-input"
                placeholder="Search EPG channels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="epg-stats">{filteredEPG.length} channels</div>
            </div>
          </div>
          <div className="channels-container">
            {filteredEPG.map((c) => {
              const id = String(c.id ?? c.identifier ?? c.name);
              return (
                <motion.div
                  key={id}
                  className={`channel-card ${dragging === id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart('epg', id)}
                  onDragEnd={handleDragEnd}
                  layout
                >
                  <div className="channel-logo">
                    {c.logo || c.icon_url ? (
                      <img src={c.logo || c.icon_url} alt="" />
                    ) : (
                      <div className="channel-logo-fallback">
                        {(c.display_name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="channel-info">
                    <div className="channel-name">
                      {c.display_name || c.name}
                    </div>
                    <div className="channel-id">{c.name || id}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="status-bar">
        <div className="status-info">
          <span className="status-label">Status:</span>
          <span className="status-text">Ready</span>
        </div>
        <div className="stats">
          <span className="stat">
            <span className="stat-label">Streaming:</span>
            <span className="stat-value">{streamingChannels.length}</span>
          </span>
          <span className="stat">
            <span className="stat-label">EPG:</span>
            <span className="stat-value">{epgChannels.length}</span>
          </span>
          <span className="stat">
            <span className="stat-label">Mapped:</span>
            <span className="stat-value">{aliases.size}</span>
          </span>
          <span className="stat">
            <span className="stat-label">Tentative:</span>
            <span className="stat-value">{tentativeMatches.size}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
