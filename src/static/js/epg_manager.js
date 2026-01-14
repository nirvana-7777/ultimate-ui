// EPG Manager - Fixed Provider Display
class EPGManager {
    constructor() {
        this.core = new EPGCore();
        this.ui = new EPGUI(this.core);
        this.player = null;
        this.initialized = false;
        this.dailyProgramsData = new Map();

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

            if (timezone) {
                this.core.config.timezone = timezone;
            }
            if (refreshInterval && !isNaN(refreshInterval)) {
                this.core.config.refreshInterval = refreshInterval;
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
            this.dailyProgramsData.clear();
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

        if (dateControls) {
            if (providerId) {
                // Hide only date controls in provider mode
                dateControls.style.display = 'none';
            } else {
                // Show date controls in "All EPG" mode
                dateControls.style.display = 'flex';
            }
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

            this.dailyProgramsData.clear();
            if (data.dailyPrograms && data.dailyPrograms instanceof Map) {
                data.dailyPrograms.forEach((value, key) => {
                    this.dailyProgramsData.set(key, value);
                });
            }

            this.ui.renderCurrentEvents(data.channels, data.currentEvents);
            this.ui.updateDateDisplay(this.core.currentDate);

            console.log(`Loaded ${data.channels.length} channels with daily programs for ${this.dailyProgramsData.size} channels`);

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

            newChannels.forEach(channel => {
                const programs = this.core.dailyPrograms.get(channel.id);
                if (programs && programs.length > 0) {
                    this.dailyProgramsData.set(channel.id, programs);
                }
            });

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
            const channelId = button.dataset.channelId;
            const programId = button.dataset.programId;
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
            const channelId = button.dataset.channelId;
            const programId = button.dataset.programId;
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

    navigateDate(days) {
        if (this.core.activeProvider) {
            if (window.showToast) window.showToast('Datumsnavigation nicht verfügbar im Provider-Modus', 'info');
            return;
        }

        this.core.navigateDate(days);
        this.ui.closeDailyPrograms();
        this.dailyProgramsData.clear();
        this.core.currentPage = 0;
        this.core.hasMoreChannels = true;
        this.removeSentinels();
        this.loadData();
    }

    goToToday() {
        if (this.core.activeProvider) {
            if (window.showToast) window.showToast('Heute-Button nicht verfügbar im Provider-Modus', 'info');
            return;
        }

        this.core.goToToday();
        this.ui.closeDailyPrograms();
        this.dailyProgramsData.clear();
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

    showDailyPrograms(channelId) {
        console.log('showDailyPrograms called with channelId:', channelId);

        const channel = this.core.getChannel(channelId);
        console.log('Found channel:', channel);

        let programs = this.dailyProgramsData.get(channelId);
        console.log('Found programs:', programs ? programs.length : 0);

        if (!channel) {
            console.error('Channel not found for ID:', channelId);
            if (window.showToast) {
                window.showToast('Kanal nicht gefunden', 'error');
            }
            return;
        }

        if (!programs || programs.length === 0) {
            console.warn('No programs found for channel:', channelId);
            if (window.showToast) {
                window.showToast('Kein Tagesprogramm verfügbar', 'warning');
            }
            return;
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
        this.dailyProgramsData.clear();

        this.initialized = false;
        console.log('EPGManager cleanup complete');
    }

    async refreshData() {
        console.log('Refreshing EPG data...');
        await this.loadData();
    }
}

window.EPGManager = EPGManager;