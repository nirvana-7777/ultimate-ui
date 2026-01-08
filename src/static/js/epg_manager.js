// EPG Manager - With Infinite Scroll for Current Events (50-item chunks)
class EPGManager {
    constructor() {
        this.core = new EPGCore();
        this.ui = new EPGUI(this.core);
        this.player = null;
        this.initialized = false;

        // IMPROVED: Separate scroll observers for current events and daily programs
        this.currentEventsScrollObserver = null;
        this.currentEventsSentinel = null;
        this.dailyScrollObserver = null;
        this.dailyScrollSentinel = null;

        // Intervals
        this.refreshInterval = null;
        this.timeUpdateInterval = null;
        this.progressUpdateInterval = null;

        // Bind methods
        this.handleClick = this.handleClick.bind(this);
        this.handleKeyboard = this.handleKeyboard.bind(this);
        this.loadMoreCurrentEvents = this.loadMoreCurrentEvents.bind(this);
        this.loadMoreDailyPrograms = this.loadMoreDailyPrograms.bind(this);
    }

    async initialize() {
        if (this.initialized) return;

        // IMPROVED: Set chunk size to 50
        this.core.config.itemsPerPage = 50;

        // Load configuration from template
        this.loadConfiguration();

        // Setup event listeners
        this.setupEventListeners();

        // Setup date navigation
        this.setupDateNavigation();

        // Setup infinite scroll for BOTH sections
        this.setupInfiniteScroll();

        // Load initial data
        await this.loadData();

        // Start auto-refresh (if enabled)
        if (this.core.config.refreshInterval > 0) {
            this.startAutoRefresh();
        }

        // Update time every minute
        this.timeUpdateInterval = setInterval(() => this.updateTimeDisplays(), 60000);

        // Update progress bars more frequently (every 30 seconds)
        this.progressUpdateInterval = setInterval(() => this.updateProgressBars(), 30000);

        this.initialized = true;
        console.log('EPGManager initialized successfully with 50-item chunks');
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

    setupEventListeners() {
        // Global click handler
        document.addEventListener('click', this.handleClick);

        // Global keyboard handler
        document.addEventListener('keydown', this.handleKeyboard);

        // Custom event for playing programs
        document.addEventListener('play-program', (e) => {
            const { channelId, programId } = e.detail;
            this.playProgram(channelId, programId);
        });
    }

    setupDateNavigation() {
        // Date navigation buttons
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
        // IMPROVED: Setup intersection observer for current events grid
        this.currentEventsScrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting &&
                    this.core.hasMoreChannels &&
                    !this.core.isLoading) {
                    this.loadMoreCurrentEvents();
                }
            });
        }, {
            root: null,
            rootMargin: '200px', // Start loading earlier
            threshold: 0.1
        });

        // Add sentinel element to current events grid
        const currentEventsGrid = document.getElementById('current-events-grid');
        if (currentEventsGrid) {
            this.currentEventsSentinel = document.createElement('div');
            this.currentEventsSentinel.id = 'current-events-sentinel';
            this.currentEventsSentinel.style.height = '1px';
            this.currentEventsSentinel.style.gridColumn = '1 / -1'; // Span all columns
            currentEventsGrid.appendChild(this.currentEventsSentinel);

            this.currentEventsScrollObserver.observe(this.currentEventsSentinel);
        }

        // Setup intersection observer for daily programs
        this.dailyScrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting &&
                    this.core.hasMoreChannels &&
                    !this.core.isLoading) {
                    this.loadMoreDailyPrograms();
                }
            });
        }, {
            root: null,
            rootMargin: '200px',
            threshold: 0.1
        });

        // Add sentinel element to daily programs
        const dailyPrograms = document.querySelector('.daily-programs');
        if (dailyPrograms) {
            this.dailyScrollSentinel = document.createElement('div');
            this.dailyScrollSentinel.id = 'daily-scroll-sentinel';
            this.dailyScrollSentinel.style.height = '1px';
            dailyPrograms.appendChild(this.dailyScrollSentinel);

            this.dailyScrollObserver.observe(this.dailyScrollSentinel);
        }

        console.log('Infinite scroll setup complete for both sections');
    }

    async loadData() {
        this.ui.showLoading(true);

        try {
            const data = await this.core.loadDataForDate(this.core.currentDate);

            this.ui.renderCurrentEvents(data.channels, data.currentEvents);
            this.ui.renderDailyPrograms(data.channels, data.dailyPrograms);
            this.ui.updateDateDisplay(this.core.currentDate);

            console.log(`Loaded ${data.channels.length} channels (page 0, chunk size: 50)`);

        } catch (error) {
            console.error('Error loading data:', error);
            this.ui.showError(error.message);
        } finally {
            this.ui.showLoading(false);
        }
    }

    async loadMoreCurrentEvents() {
        console.log('Loading more current events...');

        const success = await this.core.loadMoreChannels();

        if (success) {
            // Get the new channels (last chunk)
            const newChannels = this.core.channels.slice(-this.core.config.itemsPerPage);

            // Append to current events grid
            const container = document.getElementById('current-events-grid');
            if (container && this.currentEventsSentinel) {
                newChannels.forEach(channel => {
                    const program = this.core.currentEvents.get(channel.id);
                    const card = this.ui.createCurrentEventCard(channel, program);

                    // Insert before sentinel
                    container.insertBefore(card, this.currentEventsSentinel);
                });

                console.log(`Added ${newChannels.length} more cards to current events`);
            }
        } else {
            console.log('No more channels to load for current events');
            // Remove observer if no more data
            if (this.currentEventsScrollObserver && this.currentEventsSentinel) {
                this.currentEventsScrollObserver.unobserve(this.currentEventsSentinel);
            }
        }
    }

    async loadMoreDailyPrograms() {
        console.log('Loading more daily programs...');

        const currentChannelCount = this.core.channels.length;
        const success = await this.core.loadMoreChannels();

        if (success) {
            // Only render new channels (append)
            const container = document.querySelector('.daily-programs');
            if (container && this.dailyScrollSentinel) {
                const newChannels = this.core.channels.slice(currentChannelCount);
                newChannels.forEach(channel => {
                    const programs = this.core.dailyPrograms.get(channel.id);
                    if (programs && programs.length > 0) {
                        const channelCard = this.ui.createChannelDailyCard(channel, programs);

                        // Insert before sentinel
                        container.insertBefore(channelCard, this.dailyScrollSentinel);
                    }
                });

                console.log(`Added ${newChannels.length} more channels to daily programs`);
            }
        } else {
            console.log('No more channels to load for daily programs');
            // Remove observer if no more data
            if (this.dailyScrollObserver && this.dailyScrollSentinel) {
                this.dailyScrollObserver.unobserve(this.dailyScrollSentinel);
            }
        }
    }

    handleClick(e) {
        // Play button on tile
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

        // Expand toggle on current events
        if (e.target.closest('.expand-toggle')) {
            const channelId = e.target.closest('.channel-now-card')?.dataset.channelId;
            if (channelId) {
                this.ui.toggleChannelExpansion(channelId);
            }
            return;
        }

        // Channel header in daily view
        if (e.target.closest('.channel-daily-header')) {
            const channelId = e.target.closest('.channel-daily-card')?.dataset.channelId;
            if (channelId) {
                this.ui.toggleChannelExpansion(channelId);
            }
            return;
        }

        // Play button
        if (e.target.closest('.btn-play')) {
            e.stopPropagation();
            const programElement = e.target.closest('[data-program-id]');
            if (programElement) {
                const programId = programElement.dataset.programId;
                const channelId = programElement.dataset.channelId;
                this.playProgram(channelId, programId);
            }
            return;
        }

        // Program card click (for details)
        if (e.target.closest('.program-card') && !e.target.closest('.btn-play')) {
            const programElement = e.target.closest('.program-card');
            const programId = programElement.dataset.programId;
            const channelId = programElement.dataset.channelId;
            this.showProgramDetails(channelId, programId);
            return;
        }

        // Expand description
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
        // Skip if user is typing in an input field
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            return;
        }

        // Global keyboard shortcuts
        if (e.key === 'Escape') {
            this.ui.closeProgramDetails();
            if (this.player) {
                this.player.stop();
            }
        }

        // Alt+Left: Previous day
        if (e.key === 'ArrowLeft' && e.altKey) {
            e.preventDefault();
            this.navigateDate(-1);
        }

        // Alt+Right: Next day
        if (e.key === 'ArrowRight' && e.altKey) {
            e.preventDefault();
            this.navigateDate(1);
        }

        // Alt+T: Today
        if (e.key === 't' && e.altKey) {
            e.preventDefault();
            this.goToToday();
        }
    }

    navigateDate(days) {
        this.core.navigateDate(days);
        this.ui.clearExpandedChannels();

        // Reset pagination when changing dates
        this.core.currentPage = 0;
        this.core.hasMoreChannels = true;

        // Remove old sentinels
        this.removeSentinels();

        // Reload data
        this.loadData().then(() => {
            // Re-setup infinite scroll
            this.setupInfiniteScroll();
        });
    }

    goToToday() {
        this.core.goToToday();
        this.ui.clearExpandedChannels();

        // Reset pagination
        this.core.currentPage = 0;
        this.core.hasMoreChannels = true;

        // Remove old sentinels
        this.removeSentinels();

        // Reload data
        this.loadData().then(() => {
            // Re-setup infinite scroll
            this.setupInfiniteScroll();
        });
    }

    removeSentinels() {
        if (this.currentEventsSentinel && this.currentEventsSentinel.parentNode) {
            this.currentEventsSentinel.parentNode.removeChild(this.currentEventsSentinel);
            this.currentEventsSentinel = null;
        }

        if (this.dailyScrollSentinel && this.dailyScrollSentinel.parentNode) {
            this.dailyScrollSentinel.parentNode.removeChild(this.dailyScrollSentinel);
            this.dailyScrollSentinel = null;
        }

        if (this.currentEventsScrollObserver) {
            this.currentEventsScrollObserver.disconnect();
            this.currentEventsScrollObserver = null;
        }

        if (this.dailyScrollObserver) {
            this.dailyScrollObserver.disconnect();
            this.dailyScrollObserver = null;
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

        // Initialize player if needed
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

    updateTimeDisplays() {
        // Update current time in sidebar
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = this.core.formatDateTime(now, 'datetime');
        }

        // Update progress bars
        this.updateProgressBars();
    }

    updateProgressBars() {
        this.ui.updateProgressBars(this.core);
    }

    startAutoRefresh() {
        // Clear existing interval
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

    // Proper cleanup of all resources
    destroy() {
        console.log('Cleaning up EPGManager...');

        // Remove event listeners
        document.removeEventListener('click', this.handleClick);
        document.removeEventListener('keydown', this.handleKeyboard);

        // Cleanup scroll observers
        this.removeSentinels();

        // Clear intervals
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

        // Cleanup player
        if (this.player) {
            this.player.destroy();
            this.player = null;
        }

        // Clear core data
        this.core.clearCache();
        this.core.currentEvents.clear();
        this.core.dailyPrograms.clear();

        this.initialized = false;
        console.log('EPGManager cleanup complete');
    }

    // Added method for refresh compatibility
    async refreshData() {
        console.log('Refreshing EPG data...');
        await this.loadData();
    }
}

// Export for global access
window.EPGManager = EPGManager;