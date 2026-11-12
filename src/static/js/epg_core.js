// epg_core.js - Enhanced with provider filtering and smart time badges
class EPGCore {
    constructor() {
        this.config = {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            dateFormat: 'de-DE',
            refreshInterval: 300,
            itemsPerPage: 50,
            // UI cap for the catchup window in HOURS. The per-channel
            // catchup_hours stays authoritative; this only stops overstating
            // provider panels from blowing up the UI. Optional override via
            // the data-catchup-max-hours attribute on #template-data.
            catchupMaxHours: 168
        };

        this.channels = [];
        this.currentEvents = new Map();
        this.dailyPrograms = new Map();
        this.cache = new Map();
        // Immutable past-day program cache, keyed
        // `programs|<channelId>|<startISO>|<endISO>` — filled only with
        // fully-past ranges. Survives auto-refresh and date navigation;
        // cleared only in resetEPGState()/clearCache().
        this.pastCache = new Map();
        // Day-keyed programs from loadDailyProgramsForChannel() (today
        // included), key `<channelId>|<YYYY-MM-DD>` (LOCAL date — toISOString
        // would shift the day for positive UTC offsets). Searched first by
        // getProgram() so catchup clicks survive auto-refresh.
        this.pastProgramsByDay = new Map();
        // Per-channel manifest from the Ultimate Backend, key
        // `<provider>|<channelId>`. Survives auto-refresh.
        this.manifestCache = new Map();
        this.isLoading = false;
        this.currentDate = new Date();
        this.hasMoreChannels = true;
        this.currentPage = 0;

        // NEW: Provider filtering
        this.activeProvider = null; // null = All EPG, string = provider ID
        this.providerChannels = []; // Channels from selected provider
        this.providers = []; // List of available providers

        // Track loaded date ranges for infinite scroll
        this.loadedDateRanges = new Map(); // channelId -> Set of date strings
    }

    // NEW: Set active provider and load its channels
    async setActiveProvider(providerId) {
        this.activeProvider = providerId;
        this.providerChannels = [];
        
        if (providerId) {
            await this.loadProviderChannels(providerId);
        }
        
        // Clear cache and reset state
        this.resetEPGState();
    }

    // NEW: Load channels for a specific provider
    async loadProviderChannels(providerId) {
        try {
            const response = await fetch(`/api/mapping/channels/${providerId}`);
            const data = await response.json();
            
            if (data.success && data.channels?.channels) {
                // Attach the provider id and normalized catchup info (hours)
                // so getChannel()/getProgram() can thread them through.
                this.providerChannels = data.channels.channels.map(ch => {
                    ch.provider = providerId;
                    ch.catchup = this.normalizeCatchup(ch);
                    return ch;
                });
                console.log(`Loaded ${this.providerChannels.length} channels for provider ${providerId}`);
            } else {
                console.warn('No channels found for provider:', providerId);
                this.providerChannels = [];
            }
        } catch (error) {
            console.error('Error loading provider channels:', error);
            this.providerChannels = [];
        }
    }

    /**
     * Normalize catchup metadata to a canonical {enabled, hours} shape.
     *
     * The Ultimate Backend exposes catchup_hours (HOURS) with catchup_window
     * as the hours-shaped fallback (see _validate_catchup_window). Xtream-
     * sourced panels may carry tv_archive_duration in DAYS — converted only
     * when no hours-shaped field is present at all. Every consumer below
     * works in hours; nothing converts back to days.
     */
    normalizeCatchup(channel) {
        if (!channel) return { enabled: false, hours: 0 };

        const rawHours = channel.catchup_hours ?? channel.catchupHours
            ?? channel.CatchupHours
            ?? channel.catchup_window ?? channel.CatchupWindow
            ?? channel.catchupWindow;

        let hours = Number(rawHours);
        if (!isFinite(hours) || hours < 0) hours = 0;

        // Xtream convention (days) — only trusted when nothing hours-shaped
        // was found.
        if (rawHours === undefined || rawHours === null) {
            const rawDays = channel.tv_archive_duration ?? channel.TvArchiveDuration;
            const days = Number(rawDays);
            if (isFinite(days) && days > 0) hours = days * 24;
        }

        // UI cap (hours).
        const cap = Number(this.config.catchupMaxHours);
        if (isFinite(cap) && cap > 0 && hours > cap) hours = cap;

        // Enablement: explicit flag wins when present, else inferred from hours.
        const flag = channel.catchup_enabled ?? channel.catchupEnabled
            ?? channel.TvArchive ?? channel.tv_archive;

        let enabled;
        if (flag === undefined || flag === null) {
            enabled = hours > 0;
        } else {
            const s = String(flag).toLowerCase();
            enabled = !(s === '0' || s === 'false' || s === 'no' || s === 'off');
        }

        return { enabled: enabled && hours > 0, hours };
    }

    /**
     * Parse a program timestamp defensively. WebEPG and the Ultimate Backend
     * are inconsistent about appending "Z" or an offset; offset-less ISO
     * strings are treated as UTC (matching app.py's server-side behavior).
     */
    parseProgramTime(value) {
        if (!value) return null;
        if (value instanceof Date) return value;
        if (typeof value !== 'string') return new Date(value);
        // Offset-less ISO: 2024-11-11T20:00:00 or 2024-11-11T20:00:00.000
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) {
            return new Date(value + 'Z');
        }
        return new Date(value);
    }

    /**
     * Canonical program key — three-way fallback. Mirrors the renderer so
     * getProgram() finds every program the renderer created a dataset for.
     */
    programKey(channelId, program) {
        if (!program) return String(channelId);
        if (program.id !== undefined && program.id !== null) return String(program.id);
        if (program.program_id !== undefined && program.program_id !== null) return String(program.program_id);
        const t = this.parseProgramTime(program.start_time);
        return `${channelId}_${t ? t.getTime() : String(program.start_time)}`;
    }

    /**
     * Local calendar date key (YYYY-MM-DD) for pastProgramsByDay. Local — not
     * toISOString() — so the key names the day the user asked for regardless
     * of UTC offset.
     */
    localDateKey(date) {
        const d = new Date(date);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
    }

    /**
     * Fetch (and cache) the Ultimate Backend manifest for a channel directly
     * from ultimate_backend.public_url. Returns the parsed JSON
     * ({ manifest_url, catchup_stream_url_template,
     *    ts_catchup_stream_url_template, ... }) or null.
     */
    async getChannelManifest(provider, channelId) {
        if (!provider || !channelId) return null;
        const key = `${provider}|${channelId}`;
        const cached = this.manifestCache.get(key);
        if (cached) return cached;

        // Fetched directly from the browser-reachable Ultimate Backend, so the
        // URLs it stamps into the manifest are reachable from the browser too.
        // CORS must allow this UI's origin - if not, this fails (by design).
        const base = this.config.ultimateBackendPublicUrl;
        if (!base) {
            console.warn('ultimate_backend.public_url not configured - catchup playback disabled');
            return null;
        }

        try {
            const resp = await fetch(
                `${base}/api/providers/${encodeURIComponent(provider)}/channels/${encodeURIComponent(channelId)}/manifest`,
                { credentials: 'omit' }
            );
            if (!resp.ok) return null;
            const data = await resp.json();
            this.manifestCache.set(key, data);
            return data;
        } catch (e) {
            console.warn(`Manifest fetch failed for ${provider}/${channelId}:`, e);
            return null;
        }
    }

    /**
     * Build a catchup playback URL for a past program by substituting the two
     * tokens of catchup_stream_url_template. Returns null when the channel
     * has no catchup, the program is not past, the window is exceeded, or the
     * manifest is unavailable.
     *
     * Window check mirrors the backend exactly: age = now - start_time
     * (NOT end_time), in hours: age <= catchup_hours.
     */
    async buildCatchupStreamUrl(channel, program) {
        if (!channel || !channel.catchup || !channel.catchup.enabled) return null;

        const start = this.parseProgramTime(program && program.start_time);
        const end = this.parseProgramTime(program && program.end_time);
        if (!start || !end) return null;

        const now = new Date();
        if (end >= now) return null; // not past

        const ageHours = (now - start) / 3600000;
        if (ageHours > (channel.catchup.hours || 0)) return null;

        const manifest = await this.getChannelManifest(channel.provider, channel.id);
        if (!manifest || !manifest.catchup_stream_url_template) return null;

        return manifest.catchup_stream_url_template
            .replace('{start_time}', Math.floor(start.getTime() / 1000))
            .replace('{end_time}', Math.floor(end.getTime() / 1000));
    }

    // NEW: Load available providers
    async loadProviders() {
        try {
            const response = await fetch('/api/mapping/providers');
            const data = await response.json();
            
            if (data.success) {
                // The providers are in data.providers.providers or data.providers
                this.providers = data.providers?.providers || data.providers || [];
                return this.providers;
            }
        } catch (error) {
            console.error('Error loading providers:', error);
        }
        return [];
    }

    // NEW: Get channels based on active provider
    async fetchChannels(page = 0) {
        // If a provider is selected, use its channels
        if (this.activeProvider && this.providerChannels.length > 0) {
            // For provider mode, we show all channels at once (no pagination)
            if (page === 0) {
                return {
                    channels: this.providerChannels,
                    hasMore: false
                };
            } else {
                return {
                    channels: [],
                    hasMore: false
                };
            }
        }

        // Original behavior for "All EPG"
        try {
            const cacheKey = `channels_${page}`;
            const cached = this.cache.get(cacheKey);

            if (cached) {
                return cached;
            }

            const response = await fetch(
                `/api/epg/channels?page=${page}&limit=${this.config.itemsPerPage}`
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success || !Array.isArray(data.channels)) {
                throw new Error('Invalid response format from channels endpoint');
            }

            const result = {
                channels: data.channels,
                hasMore: data.has_more || data.channels.length === this.config.itemsPerPage
            };

            this.cache.set(cacheKey, result);
            return result;

        } catch (error) {
            console.error('Error fetching channels:', error);
            throw new Error('Kanäle konnten nicht geladen werden: ' + error.message);
        }
    }

    // MODIFIED: dual-bucket cache, both-bounds key, timestamp normalization
    async fetchProgramsForChannel(channelId, startDate, endDate) {
        try {
            // Cache key includes BOTH bounds — a day-only key collides between
            // the initial "now → tomorrow" window and an on-demand
            // "00:00 → 23:59" day fetch for the same date.
            const cacheKey = `programs|${channelId}|${startDate.toISOString()}|${endDate.toISOString()}`;

            // Fully-past ranges are immutable — keep them in pastCache which
            // survives auto-refresh / navigation; everything else (today and
            // future) stays in the volatile cache.
            const isPastRange = endDate.getTime() <= Date.now();
            const bucket = isPastRange ? this.pastCache : this.cache;
            const cached = bucket.get(cacheKey);
            if (cached) {
                return cached;
            }

            const response = await fetch(
                `/api/channels/${channelId}/programs?start=${startDate.toISOString()}&end=${endDate.toISOString()}`
            );

            if (!response.ok) {
                console.warn(`HTTP ${response.status} for channel ${channelId} programs`);
                return [];
            }

            const data = await response.json();

            let programs = [];

            if (data.success && Array.isArray(data.programs)) {
                programs = data.programs;
            } else if (Array.isArray(data)) {
                programs = data;
            }

            // Process and enrich each program
            programs.forEach(program => {
                program.channel_id = channelId;
                program.image_url = program.icon_url;
                program.stream_url = program.stream;

                // Normalize timestamps (offset-less ISO → UTC) so all date
                // math below is consistent.
                program.start_time = this.parseProgramTime(program.start_time) || program.start_time;
                program.end_time = this.parseProgramTime(program.end_time) || program.end_time;

                program.duration = program.duration || this.calculateDuration(
                    program.start_time,
                    program.end_time
                );

                program.start_time_local = this.formatDateTime(program.start_time, 'time');
                program.end_time_local = this.formatDateTime(program.end_time, 'time');
                program.date_local = this.formatDateTime(program.start_time, 'date');

                program.episode_formatted = this.parseXmltvNsEpisode(program.episode_num);

                // Calculate progress if program is currently airing
                const now = new Date();
                const start = new Date(program.start_time);
                const end = new Date(program.end_time);

                program.is_live = start <= now && end >= now;
                program.is_past = end < now;

                if (program.is_live) {
                    program.progress = this.calculateProgress(program.start_time, program.end_time);
                    program.time_remaining = this.calculateTimeRemaining(program.end_time);
                }

                // Add smart time badge
                program.time_badge = this.getSmartTimeBadge(program.start_time, program.end_time);
            });

            bucket.set(cacheKey, programs);
            return programs;

        } catch (error) {
            console.warn(`Error fetching programs for channel ${channelId}:`, error);
            return [];
        }
    }

    // NEW: Reset EPG state when switching providers
    resetEPGState() {
        this.channels = [];
        this.currentEvents.clear();
        this.dailyPrograms.clear();
        this.loadedDateRanges.clear();
        this.cache.clear();
        this.pastCache.clear();
        this.pastProgramsByDay.clear();
        this.manifestCache.clear();
        this.currentPage = 0;
        this.hasMoreChannels = true;
    }

    // MODIFIED: Load data with provider support
    async loadDataForDate(date) {
        this.isLoading = true;
        this.cache.clear();

        try {
            // Clear previous state
            this.channels = [];
            this.currentEvents.clear();
            this.dailyPrograms.clear();
            this.loadedDateRanges.clear();
            this.currentPage = 0;
            this.hasMoreChannels = true;

            // Get channels based on active provider
            const { channels, hasMore } = await this.fetchChannels(0);
            this.channels = channels;
            this.hasMoreChannels = hasMore;

            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            await this.processChannelsWithPrograms(channels, now, tomorrow);

            return {
                channels,
                currentEvents: this.currentEvents,
                dailyPrograms: this.dailyPrograms
            };

        } finally {
            this.isLoading = false;
        }
    }

    // MODIFIED: Load more channels with provider support
    async loadMoreChannels() {
        if (!this.hasMoreChannels || this.isLoading) {
            return false;
        }

        // In provider mode, there's no "more" to load
        if (this.activeProvider) {
            return false;
        }

        this.isLoading = true;
        this.currentPage++;

        try {
            const { channels, hasMore } = await this.fetchChannels(this.currentPage);

            if (channels.length > 0) {
                this.channels = [...this.channels, ...channels];
                this.hasMoreChannels = hasMore;

                const now = new Date();
                const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

                await this.processChannelsWithPrograms(channels, now, tomorrow);
            }

            return channels.length > 0;

        } finally {
            this.isLoading = false;
        }
    }

    // MODIFIED: Get channel with provider support — passthrough of the
    // catchup info and provider id needed to build catchup URLs.
    getChannel(channelId) {
        if (this.activeProvider) {
            // In provider mode, find channel in providerChannels
            const channel = this.providerChannels.find(
                c => String(c.Id) === String(channelId)
            );
            if (channel) {
                return {
                    id: channel.Id,
                    display_name: channel.Name,
                    name: channel.Id,
                    icon_url: channel.LogoUrl,
                    streamUrl: channel.StreamUrl,
                    provider: channel.provider,
                    catchup: channel.catchup
                };
            }
        }

        // Fallback to original lookup
        const id = typeof channelId === 'string' ? parseInt(channelId, 10) : channelId;
        return this.channels.find(
            c => String(c.id) === String(id) || String(c.id) === String(channelId)
        );
    }

    processChannelsWithPrograms(channels, startDate, endDate) {
        this.currentEvents.clear();
        this.dailyPrograms.clear();

        const now = new Date();

        const programPromises = channels.map(async (channel) => {
            try {
                // For provider channels, use channel.Id; for EPG channels, use channel.id
                const channelId = channel.Id || channel.id;
                const programs = await this.fetchProgramsForChannel(
                    channelId,
                    startDate,
                    endDate
                );

                channel.programs = programs;

                // Find current event
                const currentProgram = programs.find(program => {
                    const start = new Date(program.start_time);
                    const end = new Date(program.end_time);
                    return start <= now && end >= now;
                });

                if (currentProgram) {
                    currentProgram.channel_name = channel.display_name || channel.Name;
                    currentProgram.channel_icon = channel.icon_url || channel.LogoUrl;
                    this.currentEvents.set(channelId, currentProgram);
                }

                this.dailyPrograms.set(channelId, programs);

            } catch (error) {
                console.warn(`Error processing channel ${channel.Id || channel.id}:`, error);
                channel.programs = [];
            }
        });

        return Promise.all(programPromises);
    }

    // ... rest of the class remains the same (isSameDay, getSmartTimeBadge, etc.)
    
    isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    isTomorrow(date) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return this.isSameDay(tomorrow, date);
    }

    isYesterday(date) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return this.isSameDay(yesterday, date);
    }

    getSmartTimeBadge(startTime, endTime) {
        const now = new Date();
        const start = new Date(startTime);
        const end = new Date(endTime);

        const isToday = this.isSameDay(now, start);
        const isYesterday = this.isYesterday(start);
        const isTomorrow = this.isTomorrow(start);
        const isCurrentlyAiring = start <= now && end >= now;

        if (isCurrentlyAiring) {
            return {
                type: 'live',
                text: 'LIVE',
                timeRange: this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                class: 'time-badge live'
            };
        } else if (isToday) {
            return {
                type: 'today',
                text: this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                timeRange: this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                class: 'time-badge today'
            };
        } else if (isTomorrow) {
            return {
                type: 'tomorrow',
                text: 'Morgen ' + this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                timeRange: 'Morgen ' + this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                class: 'time-badge tomorrow'
            };
        } else if (isYesterday) {
            return {
                type: 'yesterday',
                text: 'Gestern ' + this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                timeRange: 'Gestern ' + this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                class: 'time-badge yesterday'
            };
        } else if (start < now) {
            // Older than yesterday: past. Without this branch these programs
            // fell through into the "future" styling.
            const dateStr = this.formatDateTime(startTime, 'short-date');
            return {
                type: 'past',
                text: `${dateStr} ${this.formatDateTime(startTime, 'time')} - ${this.formatDateTime(endTime, 'time')}`,
                timeRange: `${dateStr} ${this.formatDateTime(startTime, 'time')} - ${this.formatDateTime(endTime, 'time')}`,
                class: 'time-badge past'
            };
        } else {
            const dateStr = this.formatDateTime(startTime, 'short-date');
            return {
                type: 'future',
                text: `${dateStr} ${this.formatDateTime(startTime, 'time')} - ${this.formatDateTime(endTime, 'time')}`,
                timeRange: `${dateStr} ${this.formatDateTime(startTime, 'time')} - ${this.formatDateTime(endTime, 'time')}`,
                class: 'time-badge future'
            };
        }
    }

    calculateDuration(startTime, endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        const diff = end - start;
        return Math.round(diff / (1000 * 60));
    }

    formatDateTime(dateTime, format = 'datetime') {
        const date = new Date(dateTime);
        const options = {
            timeZone: this.config.timezone,
            hour12: false
        };

        switch (format) {
            case 'date':
                Object.assign(options, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                return date.toLocaleDateString(this.config.dateFormat, options);

            case 'time':
                Object.assign(options, {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return date.toLocaleTimeString(this.config.dateFormat, options);

            case 'short-date':
                Object.assign(options, {
                    day: '2-digit',
                    month: '2-digit'
                });
                return date.toLocaleDateString(this.config.dateFormat, options);

            default:
                Object.assign(options, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return date.toLocaleString(this.config.dateFormat, options);
        }
    }

    calculateProgress(startTime, endTime) {
        const now = new Date();
        const start = new Date(startTime);
        const end = new Date(endTime);

        if (now < start || now > end) return null;

        const total = end - start;
        const elapsed = now - start;
        const percentage = (elapsed / total) * 100;

        return {
            percentage,
            duration: Math.round((end - start) / 60000),
            elapsed: Math.round(elapsed / 60000),
            remaining: Math.round((end - now) / 60000)
        };
    }

    calculateTimeRemaining(endTime) {
        const now = new Date();
        const end = new Date(endTime);
        const diff = end - now;

        if (diff <= 0) return 'Beendet';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `noch ${hours}h ${minutes} min`;
        }
        return `noch ${minutes} min`;
    }

    // MODIFIED: search the durable day store first (survives auto-refresh),
    // then today's programs; match via programKey() so id-less programs work.
    getProgram(channelId, programId) {
        const idStr = String(programId);

        for (const [key, programs] of this.pastProgramsByDay) {
            if (!key.startsWith(`${channelId}|`)) continue;
            const found = programs.find(p => this.programKey(channelId, p) === idStr);
            if (found) return found;
        }

        const todayPrograms = this.dailyPrograms.get(channelId) || [];
        return todayPrograms.find(p => this.programKey(channelId, p) === idStr);
    }

    navigateDate(days) {
        this.currentDate.setDate(this.currentDate.getDate() + days);
        this.cache.clear();
        this.currentEvents.clear();
        this.dailyPrograms.clear();
        this.loadedDateRanges.clear();
    }

    goToToday() {
        this.currentDate = new Date();
        this.cache.clear();
        this.currentEvents.clear();
        this.dailyPrograms.clear();
        this.loadedDateRanges.clear();
    }

    clearCache() {
        this.cache.clear();
        this.pastCache.clear();
        this.pastProgramsByDay.clear();
        this.manifestCache.clear();
    }

    // MODIFIED: hourly catchup gate + durable persistence.
    //
    // A past day is worth fetching while ANY of its programs can still be
    // inside the window: now - (end of day) < catchup_hours. A 12 h window
    // makes "yesterday" unavailable at noon — that is the point of switching
    // to hourly windows. Every explicitly requested day (today included) is
    // persisted into pastProgramsByDay so getProgram() finds it after
    // auto-refresh wiped the volatile caches.
    async loadDailyProgramsForChannel(channelId, date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        const now = new Date();
        if (endDate.getTime() <= now.getTime()) {
            const channel = this.getChannel(channelId);
            const allowedHours = channel && channel.catchup && channel.catchup.enabled
                ? (channel.catchup.hours || 0) : 0;
            if ((now.getTime() - endDate.getTime()) / 3600000 > allowedHours) {
                return [];
            }
        }

        const programs = await this.fetchProgramsForChannel(channelId, startDate, endDate);

        this.pastProgramsByDay.set(
            `${channelId}|${this.localDateKey(startDate)}`,
            programs
        );

        return programs;
    }

    parseXmltvNsEpisode(episodeNum) {
        if (!episodeNum || typeof episodeNum !== 'string') {
            return null;
        }

        episodeNum = episodeNum.trim();
        episodeNum = episodeNum.replace(/\.$/, '');

        const parts = episodeNum.split('.');

        if (parts.length < 2 || parts[0] === '' || parts[1] === '') {
            return null;
        }

        const season = parseInt(parts[0], 10);
        const episode = parseInt(parts[1], 10);

        if (isNaN(season) || isNaN(episode) || season < 0 || episode < 0) {
            return null;
        }

        const displaySeason = season + 1;
        const displayEpisode = episode + 1;

        if (season === 0) {
            let result = `S01E${displayEpisode.toString().padStart(2, '0')}`;

            if (parts.length >= 3 && parts[2]) {
                const partInfo = this.parsePartInfo(parts[2]);
                if (partInfo) {
                    result += ` (Part ${partInfo.current}/${partInfo.total})`;
                }
            }
            return result;
        }

        let result = `S${displaySeason.toString().padStart(2, '0')}E${displayEpisode.toString().padStart(2, '0')}`;

        if (parts.length >= 3 && parts[2]) {
            const partInfo = this.parsePartInfo(parts[2]);
            if (partInfo) {
                result += ` (Part ${partInfo.current}/${partInfo.total})`;
            }
        }

        return result;
    }

    parsePartInfo(partString) {
        if (!partString) return null;

        const partParts = partString.split('/');
        if (partParts.length !== 2) return null;

        const partCurrent = parseInt(partParts[0], 10);
        const partTotal = parseInt(partParts[1], 10);

        if (isNaN(partCurrent) || isNaN(partTotal) ||
            partCurrent < 0 || partTotal < 1 || partCurrent >= partTotal) {
            return null;
        }

        return {
            current: partCurrent + 1,
            total: partTotal
        };
    }
}