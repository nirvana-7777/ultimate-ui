// EPG Manager - Fixed Provider Display
class EPGManager {
    constructor() {
        this.core = new EPGCore();
        this.ui = new EPGUI(this.core);
        this.player = null;
        this.initialized = false;
        // dailyProgramsData removed — core.dailyPrograms and
        // core.pastProgramsByDay are the single source of truth.

        this.currentEventsScrollObserver = null;
        this.currentEventsSentinel = null;

        this.refreshInterval = null;
        this.timeUpdateInterval = null;
        this.progressUpdateInterval = null;

        this.handleClick = this.handleClick.bind(this);
        this.handleKeyboard = this.handleKeyboard.bind(this);
        this.loadMoreCurrentEvents = this.loadMoreCurrentEvents.bind(this);
        this.handleProviderChange = this.handleProviderChange.bind(this);
    }

    async initialize() {
        if (this.initialized) return;

        this.core.config.itemsPerPage = 50;

        this.loadConfiguration();
        this.setupEventListeners();
        this.setupDateNavigation();
        this.setupInfiniteScroll();

        await this.setupProviderDropdown();

        await this.loadData();

        if (this.core.config.refreshInterval > 0) {
            this.startAutoRefresh();
        }

        this.timeUpdateInterval = setInterval(() => this.updateTimeDisplays(), 60000);
        this.progressUpdateInterval = setInterval(() => this.updateProgressBars(), 30000);

        this.initialized = true;
        console.log('EPGManager initialized successfully with provider filtering');
    }

    loadConfiguration() {
        const configElement = document.getElementById('template-data');
        if (configElement) {
            const timezone = configElement.dataset.timezone;
            const refreshInterval = parseInt(configElement.dataset.refreshInterval, 10);
            // Optional — the attribute may be absent; core's default (168 h)
            // applies then.
            const catchupMaxHours = parseInt(configElement.dataset.catchupMaxHours, 10);
            const ultimatePublic = configElement.dataset.ultimateBackendPublicUrl;

            if (timezone) {
                this.core.config.timezone = timezone;
            }
            if (refreshInterval && !isNaN(refreshInterval)) {
                this.core.config.refreshInterval = refreshInterval;
            }
            if (catchupMaxHours && !isNaN(catchupMaxHours) && catchupMaxHours > 0) {
                this.core.config.catchupMaxHours = catchupMaxHours;
            }
            if (ultimatePublic) {
                this.core.config.ultimateBackendPublicUrl = ultimatePublic.replace(/\/+$/, '');
            }
        }
    }

    async setupProviderDropdown() {
        const providerSelect = document.getElementById('provider-select-epg');

        if (!providerSelect) {
            console.warn('Provider select element not found');
            return;
        }

        providerSelect.innerHTML = '<option value="">Alle EPG Kanäle</option>';

        try {
            const providers = await this.core.loadProviders();
            console.log('Loaded providers:', providers);

            providers.forEach(provider => {
                const option = document.createElement('option');
                option.value = provider.name || provider.id;
                option.textContent = provider.label || provider.name || `Provider ${provider.id}`;
                providerSelect.appendChild(option);
            });

            providerSelect.addEventListener('change', this.handleProviderChange);

            console.log('Provider dropdown setup complete');

        } catch (error) {
            console.error('Error setting up provider dropdown:', error);
        }
    }

    async handleProviderChange(event) {
        const providerId = event.target.value;

        console.log('Provider changed to:', providerId);

        if (window.showLoading) window.showLoading('Lade Kanäle...');

        try {
            await this.core.setActiveProvider(providerId);

            this.ui.closeDailyPrograms();
            this.removeSentinels();

            await this.loadData();

            this.updateProviderDisplay(providerId);

        } catch (error) {
            console.error('Error switching provider:', error);
            if (window.showToast) window.showToast(`Fehler beim Wechseln: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    // FIXED: Only hide date controls, not the entire navigation
    updateProviderDisplay(providerId) {
        const dateControls = document.querySelector('.date-controls');
        const providerSelect = document.getElementById('provider-select-epg');

        // Date controls stay visible in provider mode — catchup needs backward
        // navigation and navigateDate() now clamps it to the catchup window.
        if (dateControls) {
            dateControls.style.display = 'flex';
        }

        if (providerSelect) {
            providerSelect.value = providerId || '';
        }

        // Update page title or add indicator
        const headerElement = document.querySelector('.date-navigation h2');
        if (headerElement && providerId) {
            const providerName = providerSelect.options[providerSelect.selectedIndex]?.text || providerId;
            headerElement.textContent = `EPG Programmübersicht - ${providerName}`;
        } else if (headerElement) {
            headerElement.textContent = 'EPG Programmübersicht';
        }
    }

    setupEventListeners() {
        document.addEventListener('click', this.handleClick);
        document.addEventListener('keydown', this.handleKeyboard);

        document.addEventListener('play-program', (e) => {
            const { channelId, programId } = e.detail;
            this.playProgram(channelId, programId);
        });
    }

    setupDateNavigation() {
        const prevBtn = document.getElementById('date-prev-btn');
        const nextBtn = document.getElementById('date-next-btn');
        const todayBtn = document.getElementById('date-today-btn');

        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateDate(-1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateDate(1);
            });
        }

        if (todayBtn) {
            todayBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.goToToday();
            });
        }
    }

    setupInfiniteScroll() {
        this.currentEventsScrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting &&
                    this.core.hasMoreChannels &&
                    !this.core.isLoading) {
                    console.log('Current events sentinel triggered!');
                    this.loadMoreCurrentEvents();
                }
            });
        }, {
            root: null,
            rootMargin: '400px',
            threshold: 0
        });

        console.log('Infinite scroll observer created');
    }

    reattachSentinel() {
        const currentEventsGrid = document.getElementById('current-events-grid');
        if (currentEventsGrid) {
            if (this.currentEventsSentinel && this.currentEventsSentinel.parentNode) {
                this.currentEventsSentinel.parentNode.removeChild(this.currentEventsSentinel);
            }

            this.currentEventsSentinel = document.createElement('div');
            this.currentEventsSentinel.id = 'current-events-sentinel';
            this.currentEventsSentinel.style.cssText = 'height: 1px; width: 100%; background: transparent;';
            currentEventsGrid.appendChild(this.currentEventsSentinel);

            if (this.currentEventsScrollObserver) {
                this.currentEventsScrollObserver.observe(this.currentEventsSentinel);
                console.log('Current events sentinel reattached and observed');
            }
        }
    }

    async loadData() {
        this.ui.showLoading(true);

        try {
            const data = await this.core.loadDataForDate(this.core.currentDate);

            this.ui.renderCurrentEvents(data.channels, data.currentEvents);
            this.ui.updateDateDisplay(this.core.currentDate);

            console.log(`Loaded ${data.channels.length} channels with daily programs for ${this.core.dailyPrograms.size} channels`);

            this.reattachSentinel();

        } catch (error) {
            console.error('Error loading data:', error);
            this.ui.showError(error.message);
        } finally {
            this.ui.showLoading(false);
        }
    }

    async loadMoreCurrentEvents() {
        console.log('Loading more current events... hasMore:', this.core.hasMoreChannels, 'isLoading:', this.core.isLoading);

        if (!this.core.hasMoreChannels || this.core.isLoading) {
            console.log('Cannot load more - hasMore:', this.core.hasMoreChannels, 'isLoading:', this.core.isLoading);
            return;
        }

        if (this.core.activeProvider) {
            console.log('Provider mode - no infinite scroll');
            return;
        }

        const beforeCount = this.core.channels.length;
        const success = await this.core.loadMoreChannels();

        if (success) {
            const afterCount = this.core.channels.length;
            const newCount = afterCount - beforeCount;
            console.log(`Loaded ${newCount} new channels (${beforeCount} -> ${afterCount})`);

            const newChannels = this.core.channels.slice(beforeCount);

            // core.dailyPrograms is already populated by loadMoreChannels().

            const container = document.getElementById('current-events-grid');
            if (container && this.currentEventsSentinel) {
                const sentinel = this.currentEventsSentinel;
                if (sentinel.parentNode === container) {
                    sentinel.remove();
                }

                let addedCount = 0;
                newChannels.forEach(channel => {
                    const program = this.core.currentEvents.get(channel.id);
                    const card = this.ui.createCurrentEventCard(channel, program);
                    container.appendChild(card);
                    addedCount++;
                });

                container.appendChild(sentinel);

                console.log(`Added ${addedCount} cards`);
            }
        } else {
            console.log('No more channels to load');
            if (this.currentEventsScrollObserver && this.currentEventsSentinel) {
                this.currentEventsScrollObserver.unobserve(this.currentEventsSentinel);
                console.log('Stopped observing sentinel');
            }
        }
    }

    handleClick(e) {
        // Catchup replay — must run before the .daily-program-card-expanded
        // branch below, otherwise the click bubbles into details opening.
        if (e.target.closest('.btn-catchup')) {
            e.stopPropagation();
            const button = e.target.closest('.btn-catchup');
            this.playCatchup(
                decodeURIComponent(button.dataset.channelId),
                decodeURIComponent(button.dataset.programId)
            );
            return;
        }

        if (e.target.closest('.btn-catchup-download')) {
            e.stopPropagation();
            const button = e.target.closest('.btn-catchup-download');
            this.downloadCatchup(
                decodeURIComponent(button.dataset.channelId),
                decodeURIComponent(button.dataset.programId)
            );
            return;
        }

        // ADDED: Handle play button for channel streams
        if (e.target.closest('.btn-play-channel')) {
            e.stopPropagation();
            const button = e.target.closest('.btn-play-channel');
            const channelId = button.dataset.channelId;
            if (channelId) {
                this.playChannel(channelId);
            }
            return;
        }

        if (e.target.closest('.btn-play-tile')) {
            e.stopPropagation();
            const button = e.target.closest('.btn-play-tile');
            const channelId = decodeURIComponent(button.dataset.channelId);
            const programId = decodeURIComponent(button.dataset.programId);
            if (channelId && programId) {
                this.playProgram(channelId, programId);
            }
            return;
        }

        if (e.target.closest('.expand-daily-btn')) {
            e.stopPropagation();
            const button = e.target.closest('.expand-daily-btn');
            const channelId = button.dataset.channelId;
            console.log('Expand daily clicked for channel ID:', channelId);
            if (channelId) {
                this.showDailyPrograms(channelId);
            }
            return;
        }

        if (e.target.closest('.close-daily-programs') || e.target.id === 'close-daily-btn') {
            e.preventDefault();
            this.ui.closeDailyPrograms();
            return;
        }

        if (e.target.closest('.btn-play') && e.target.closest('.daily-program-card-expanded')) {
            e.stopPropagation();
            const button = e.target.closest('.btn-play');
            const channelId = decodeURIComponent(button.dataset.channelId);
            const programId = decodeURIComponent(button.dataset.programId);
            if (channelId && programId) {
                this.playProgram(channelId, programId);
            }
            return;
        }

        if (e.target.closest('.daily-program-card-expanded') && !e.target.closest('.btn-play')) {
            const programElement = e.target.closest('.daily-program-card-expanded');
            const programId = programElement.dataset.programId;
            const channelId = programElement.dataset.channelId;
            this.showProgramDetails(channelId, programId);
            return;
        }

        if (e.target.closest('.expand-description')) {
            const description = e.target.closest('.program-details')?.querySelector('.program-description');
            if (description) {
                const isExpanded = description.classList.contains('expanded');
                description.classList.toggle('expanded');
                e.target.textContent = isExpanded ? 'Mehr anzeigen' : 'Weniger anzeigen';
            }
            return;
        }
    }

    handleKeyboard(e) {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            return;
        }

        if (e.key === 'Escape') {
            this.ui.closeProgramDetails();
            this.ui.closeDailyPrograms();
            if (this.player) {
                this.player.stop();
            }
        }

        if (e.key === 'ArrowLeft' && e.altKey) {
            e.preventDefault();
            this.navigateDate(-1);
        }

        if (e.key === 'ArrowRight' && e.altKey) {
            e.preventDefault();
            this.navigateDate(1);
        }

        if (e.key === 't' && e.altKey) {
            e.preventDefault();
            this.goToToday();
        }
    }

    // MODIFIED: date navigation works in provider mode, clamped to the
    // catchup window in HOURS. All-EPG mode keeps its full-reload behavior.
    navigateDate(days) {
        if (this.core.activeProvider) {
            const now = new Date();

            // The provider's widest window decides how far back the whole
            // view can go.
            const maxHours = this.core.providerChannels.reduce(
                (m, c) => Math.max(m, (c.catchup && c.catchup.hours) || 0), 0
            );

            const target = new Date(this.core.currentDate);
            target.setDate(target.getDate() + days);
            target.setHours(0, 0, 0, 0);

            // Earliest navigable day: the calendar day containing
            // (now - maxHours) — everything earlier is fully out of window.
            const floor = new Date(now.getTime() - maxHours * 3600000);
            floor.setHours(0, 0, 0, 0);

            // Latest navigable day: tomorrow (the EPG data horizon).
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const ceil = new Date(today);
            ceil.setDate(ceil.getDate() + 1);

            if (target < floor || target > ceil) {
                if (window.showToast) {
                    const pretty = (maxHours > 0 && maxHours % 24 === 0)
                        ? `${maxHours / 24} Tag(e)`
                        : `${maxHours} Stunde(n)`;
                    window.showToast(`Catchup nur bis ${pretty} verfügbar`, 'info');
                }
                return;
            }

            this.core.currentDate = target;
            this.ui.updateDateDisplay(target);

            // The grid keeps showing current programmes; only refresh the
            // daily view if one is open.
            const dailyOpen = document.getElementById('daily-programs-container')
                && document.getElementById('daily-programs-container').classList.contains('active');
            if (dailyOpen) {
                const openChannelId = document.querySelector('.channel-daily-expanded')
                    && document.querySelector('.channel-daily-expanded').dataset.channelId;
                if (openChannelId) {
                    this.showDailyPrograms(decodeURIComponent(openChannelId));
                }
            }
            return;
        }

        this.core.navigateDate(days);
        this.ui.closeDailyPrograms();
        this.core.currentPage = 0;
        this.core.hasMoreChannels = true;
        this.removeSentinels();
        this.loadData();
    }

    // MODIFIED: provider mode returns to today without a reload — the grid
    // already shows current programmes; the open daily view is refreshed.
    goToToday() {
        if (this.core.activeProvider) {
            this.core.currentDate = new Date();
            this.ui.updateDateDisplay(this.core.currentDate);

            const dailyOpen = document.getElementById('daily-programs-container')
                && document.getElementById('daily-programs-container').classList.contains('active');
            if (dailyOpen) {
                const openChannelId = document.querySelector('.channel-daily-expanded')
                    && document.querySelector('.channel-daily-expanded').dataset.channelId;
                if (openChannelId) {
                    this.showDailyPrograms(decodeURIComponent(openChannelId));
                }
            }
            return;
        }

        this.core.goToToday();
        this.ui.closeDailyPrograms();
        this.core.currentPage = 0;
        this.core.hasMoreChannels = true;
        this.removeSentinels();
        this.loadData();
    }

    removeSentinels() {
        if (this.currentEventsSentinel && this.currentEventsSentinel.parentNode) {
            this.currentEventsSentinel.parentNode.removeChild(this.currentEventsSentinel);
            this.currentEventsSentinel = null;
        }

        if (this.currentEventsScrollObserver) {
            this.currentEventsScrollObserver.disconnect();
            this.currentEventsScrollObserver = null;
        }
    }

    // ADDED: Play channel stream directly
    async playChannel(channelId) {
        const channel = this.core.getChannel(channelId);
        if (!channel) {
            console.error('Channel not found:', channelId);
            if (window.showToast) {
                window.showToast('Kanal nicht gefunden', 'error');
            }
            return;
        }

        // For provider channels, get stream URL from channel
        let streamUrl = null;

        if (this.core.activeProvider && this.core.providerChannels.length > 0) {
            const providerChannel = this.core.providerChannels.find(c => c.Id === channelId);
            streamUrl = providerChannel?.StreamUrl;
        } else {
            streamUrl = channel.stream_url || channel.stream;
        }

        if (!streamUrl) {
            if (window.showToast) {
                window.showToast('Kein Stream für diesen Kanal verfügbar', 'warning');
            }
            return;
        }

        if (!this.player) {
            await this.initializePlayer();
        }

        if (this.player) {
            await this.player.play(streamUrl, {
                title: channel.display_name || channel.Name,
                subtitle: 'Live Stream'
            });
        }
    }

    // ADDED: Replay a past program via the backend's catchup stream.
    // Pre-flight maps backend errors to specific toasts before Shaka runs.
    async playCatchup(channelId, programId) {
        const channel = this.core.getChannel(channelId);
        const program = this.core.getProgram(channelId, programId);

        if (!channel || !program) {
            console.error('Catchup program not found:', channelId, programId);
            if (window.showToast) {
                window.showToast('Programm nicht gefunden', 'error');
            }
            return;
        }

        if (!this.core.config.ultimateBackendPublicUrl) {
            if (window.showToast) {
                window.showToast('Catchup nicht konfiguriert (ultimate_backend.public_url fehlt)', 'warning');
            }
            return;
        }

        const url = await this.core.buildCatchupStreamUrl(channel, program);
        if (!url) {
            if (window.showToast) {
                window.showToast('Catchup für diese Sendung nicht mehr verfügbar', 'warning');
            }
            return;
        }

        // Pre-flight: Shaka only reports a generic error code, the backend's
        // JSON error body would be lost. Read the status/body here and map it
        // to a specific toast. The body is never read on success (aborted
        // right after the headers), so a long-running response is harmless.
        const blocked = await this.catchupPreflight(url);
        if (blocked) {
            if (window.showToast) window.showToast(blocked.msg, blocked.level);
            return;
        }

        if (!this.player) {
            await this.initializePlayer();
        }

        if (this.player) {
            const ok = await this.player.play(url, {
                title: program.title,
                subtitle: `Catchup · ${this.core.formatDateTime(program.start_time, 'time')}`
            });
            if (ok === false && this.player.hidePlayer) {
                this.player.hidePlayer(); // play() already toasted the error
            }
        }
    }

    // Returns null when playback may proceed, else { msg, level }.
    async catchupPreflight(url) {
        const controller = new AbortController();
        try {
            const resp = await fetch(url, { method: 'GET', credentials: 'omit', signal: controller.signal });
            if (!resp.ok) {
                let msg = 'Catchup nicht abspielbar';
                try {
                    const errText = String((await resp.json())?.error || '');
                    if (/outside.*catchup|catchup.*window/i.test(errText)) {
                        msg = 'Catchup für diese Sendung ist abgelaufen';
                    } else if (/not supported|no catchup/i.test(errText)) {
                        msg = 'Catchup wird für diesen Kanal nicht unterstützt';
                    } else if (/media proxy|MEDIA_PROXY_URL/i.test(errText)) {
                        msg = 'Catchup momentan nicht verfügbar (Media-Proxy nicht konfiguriert)';
                    } else if (errText) {
                        msg = errText;
                    }
                } catch (_) { /* body not JSON */ }
                return { msg, level: 'warning' };
            }

            // DRM hint header. Only readable cross-origin if the backend sends
            // Access-Control-Expose-Headers: x-kodi-drm-configs - otherwise
            // this is null and the check is simply skipped.
            const drmB64 = resp.headers.get('x-kodi-drm-configs');
            if (drmB64) {
                try {
                    const schemes = Object.keys(JSON.parse(globalThis.atob(drmB64)));
                    if (schemes.some(s => s !== 'org.w3.clearkey' && s !== 'none')) {
                        return {
                            msg: 'Dieser Inhalt ist mit Widevine/PlayReady geschützt und kann im Browser nicht abgespielt werden',
                            level: 'warning'
                        };
                    }
                } catch (_) { /* malformed header - proceed */ }
            }
            return null;
        } catch (e) {
            console.warn('Catchup preflight failed:', e);
            return { msg: 'Catchup-Verbindung fehlgeschlagen', level: 'error' };
        } finally {
            controller.abort(); // never download the body
        }
    }

    // ADDED: .ts download through the Flask proxy (internal URL, streamed).
    async downloadCatchup(channelId, programId) {
        const channel = this.core.getChannel(channelId);
        const program = this.core.getProgram(channelId, programId);
        if (!channel || !program) return;

        const start = this.core.parseProgramTime(program.start_time);
        const end = this.core.parseProgramTime(program.end_time);
        if (!start || !end) return;

        const filename = `${channel.display_name}_${program.title}`.replace(/[^A-Za-z0-9._-]+/g, '_');
        const params = new URLSearchParams({
            provider: channel.provider,
            channel: String(channel.id),
            start: String(Math.floor(start.getTime() / 1000)),
            end: String(Math.floor(end.getTime() / 1000)),
            filename,
        });
        const dlUrl = `/api/proxy/catchup/download?${params}`;

        // HEAD pre-flight: otherwise a 4xx/5xx replaces the page with raw JSON.
        try {
            const head = await fetch(dlUrl, { method: 'HEAD' });
            if (!head.ok) {
                const msg = head.status === 503
                    ? 'Download für diesen Kanal nicht verfügbar'
                    : head.status === 400 ? 'Ungültige Download-Anfrage'
                    : 'Download nicht verfügbar';
                if (window.showToast) window.showToast(msg, 'warning');
                return;
            }
        } catch (e) {
            if (window.showToast) window.showToast('Download-Verbindung fehlgeschlagen', 'error');
            return;
        }

        window.location.href = dlUrl;
    }

    async playProgram(channelId, programId) {
        const program = this.core.getProgram(channelId, programId);
        if (!program) {
            console.error('Program not found:', channelId, programId);
            if (window.showToast) {
                window.showToast('Programm nicht gefunden', 'error');
            }
            return;
        }

        const streamUrl = program.stream_url || program.stream;
        if (!streamUrl) {
            if (window.showToast) {
                window.showToast('Kein Stream für dieses Programm verfügbar', 'warning');
            }
            return;
        }

        if (!this.player) {
            await this.initializePlayer();
        }

        if (this.player) {
            await this.player.play(streamUrl, {
                title: program.title,
                subtitle: program.subtitle
            });
        }
    }

    async initializePlayer() {
        if (!window.EPGPlayer) {
            console.warn('EPGPlayer not available');
            if (window.showToast) {
                window.showToast('Player nicht verfügbar', 'error');
            }
            return;
        }

        try {
            this.player = new window.EPGPlayer();
            await this.player.initialize();
            console.log('Player initialized');
        } catch (error) {
            console.error('Error initializing player:', error);
            if (window.showToast) {
                window.showToast('Fehler beim Initialisieren des Players', 'error');
            }
        }
    }

    showProgramDetails(channelId, programId) {
        const program = this.core.getProgram(channelId, programId);
        if (program) {
            this.ui.showProgramDetails(program);
        } else {
            console.error('Program not found:', channelId, programId);
        }
    }

    // MODIFIED: date-aware and async. Today on a catchup-enabled channel
    // fetches the FULL day (00:00 → 23:59) on demand — the now → tomorrow
    // initial window drops programmes that already ended, so without this
    // "replay this morning's show" has no card. Past days are fetched on
    // demand too, gated by the hourly catchup window inside core.
    async showDailyPrograms(channelId) {
        console.log('showDailyPrograms called with channelId:', channelId);

        const channel = this.core.getChannel(channelId);
        if (!channel) {
            console.error('Channel not found for ID:', channelId);
            if (window.showToast) {
                window.showToast('Kanal nicht gefunden', 'error');
            }
            return;
        }

        const selectedDate = new Date(this.core.currentDate);
        selectedDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isToday = selectedDate.getTime() === today.getTime();

        const needsFullDay = isToday && channel.catchup && channel.catchup.enabled;

        let programs;
        if (isToday && !needsFullDay) {
            programs = this.core.dailyPrograms.get(channelId) || [];
        } else {
            if (window.showLoading) window.showLoading('Lade Programm...');
            try {
                programs = await this.core.loadDailyProgramsForChannel(
                    channelId, this.core.currentDate
                );
            } finally {
                if (window.hideLoading) window.hideLoading();
            }
        }

        if (!programs || programs.length === 0) {
            const msg = isToday
                ? 'Kein Tagesprogramm verfügbar'
                : `Keine Programme für ${this.core.formatDateTime(this.core.currentDate, 'date')} verfügbar`;
            console.warn('No programs found for channel:', channelId, msg);
            if (window.showToast) {
                window.showToast(msg, 'warning');
            }
            return;
        }

        // Lazily determine download availability once per channel. Only stored
        // when the manifest was actually fetched (a transient failure must not
        // hide the button permanently). channel.catchup is the shared object
        // from core.providerChannels, so this persists.
        if (channel.catchup && channel.catchup.enabled && channel.catchup.tsAvailable === undefined) {
            const manifest = await this.core.getChannelManifest(channel.provider, channel.id);
            if (manifest) {
                channel.catchup.tsAvailable = Boolean(manifest.ts_catchup_stream_url_template);
            }
        }

        this.ui.showDailyPrograms(channel, programs);
    }

    updateTimeDisplays() {
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = this.core.formatDateTime(now, 'datetime');
        }

        this.updateProgressBars();
    }

    updateProgressBars() {
        this.ui.updateProgressBars(this.core);
    }

    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        const intervalSeconds = this.core.config.refreshInterval;

        console.log(`Starting auto-refresh every ${intervalSeconds} seconds`);

        this.refreshInterval = setInterval(() => {
            if (!this.core.isLoading) {
                console.log('Auto-refreshing data...');
                this.loadData();
            }
        }, intervalSeconds * 1000);
    }

    destroy() {
        console.log('Cleaning up EPGManager...');

        document.removeEventListener('click', this.handleClick);
        document.removeEventListener('keydown', this.handleKeyboard);

        this.removeSentinels();

        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }

        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
            this.progressUpdateInterval = null;
        }

        if (this.player) {
            this.player.destroy();
            this.player = null;
        }

        this.core.clearCache();
        this.core.currentEvents.clear();

        this.initialized = false;
        console.log('EPGManager cleanup complete');
    }

    async refreshData() {
        console.log('Refreshing EPG data...');
        await this.loadData();
    }
}

window.EPGManager = EPGManager;