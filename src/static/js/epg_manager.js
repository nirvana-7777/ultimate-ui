// epg_manager.js - Fixed to match original data flow
class EPGManager {
    constructor() {
        this.core = new EPGCore();
        this.ui = new EPGUI(this.core);
        this.player = null;
        this.initialized = false;

        // For infinite scroll
        this.scrollObserver = null;

        // Bind methods
        this.handleClick = this.handleClick.bind(this);
        this.handleKeyboard = this.handleKeyboard.bind(this);
        this.loadMoreChannels = this.loadMoreChannels.bind(this);
    }

    async initialize() {
        if (this.initialized) return;

        // Load configuration from template
        this.loadConfiguration();

        // Setup event listeners
        this.setupEventListeners();

        // Setup date navigation
        this.setupDateNavigation();

        // Setup infinite scroll
        this.setupInfiniteScroll();

        // Load initial data
        await this.loadData();

        // Start auto-refresh (if enabled)
        if (this.core.config.refreshInterval > 0) {
            this.startAutoRefresh();
        }

        // Update time every minute
        this.timeUpdateInterval = setInterval(() => this.updateTimeDisplays(), 60000);

        this.initialized = true;
    }

    loadConfiguration() {
        const configElement = document.getElementById('template-data');
        if (configElement) {
            const timezone = configElement.dataset.timezone;
            const refreshInterval = parseInt(configElement.dataset.refreshInterval, 10);

            if (timezone) {
                this.core.config.timezone = timezone;
            }
            if (refreshInterval) {
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
            this.playProgram(e.detail.channelId, e.detail.programId);
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
        // Setup intersection observer for infinite scroll
        this.scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting &&
                    this.core.hasMoreChannels &&
                    !this.core.isLoading) {
                    this.loadMoreChannels();
                }
            });
        }, {
            root: null,
            rootMargin: '100px',
            threshold: 0.1
        });

        // Add sentinel element
        const sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.style.height = '1px';
        document.querySelector('.daily-programs')?.appendChild(sentinel);

        if (sentinel) {
            this.scrollObserver.observe(sentinel);
        }
    }

    async loadData() {
        this.ui.showLoading(true);

        try {
            const data = await this.core.loadDataForDate(this.core.currentDate);

            this.ui.renderCurrentEvents(data.channels, data.currentEvents);
            this.ui.renderDailyPrograms(data.channels, data.dailyPrograms);
            this.ui.updateDateDisplay(this.core.currentDate);

        } catch (error) {
            console.error('Error loading data:', error);
            this.ui.showError(error.message);
        } finally {
            this.ui.showLoading(false);
        }
    }

    async loadMoreChannels() {
        const success = await this.core.loadMoreChannels();

        if (success) {
            // Update UI with new channels
            const data = {
                channels: this.core.channels,
                currentEvents: this.core.currentEvents,
                dailyPrograms: this.core.dailyPrograms
            };

            // Only render new daily programs (append)
            const container = document.querySelector('.daily-programs');
            if (container) {
                const newChannels = this.core.channels.slice(-this.core.config.itemsPerPage);
                newChannels.forEach(channel => {
                    const programs = this.core.dailyPrograms.get(channel.id);
                    if (programs && programs.length > 0) {
                        const channelCard = this.ui.createChannelDailyCard(channel, programs);
                        container.appendChild(channelCard);
                    }
                });
            }
        }
    }

    handleClick(e) {
        // Date navigation
        if (e.target.closest('#date-prev-btn') ||
            e.target.closest('#date-next-btn') ||
            e.target.closest('#date-today-btn')) {
            return; // Handled by button listeners
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
            const description = e.target.closest('.program-description');
            if (description) {
                description.classList.toggle('expanded');
                e.target.textContent = description.classList.contains('expanded')
                    ? 'Weniger anzeigen'
                    : 'Mehr anzeigen';
            }
            return;
        }
    }

    handleKeyboard(e) {
        // Global keyboard shortcuts
        if (e.key === 'Escape') {
            this.ui.closeProgramDetails();
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
        this.core.navigateDate(days);
        this.ui.clearExpandedChannels();
        this.loadData();
    }

    goToToday() {
        this.core.goToToday();
        this.ui.clearExpandedChannels();
        this.loadData();
    }

    async playProgram(channelId, programId) {
        const program = this.core.getProgram(channelId, programId);
        if (!program?.stream_url) {
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
            await this.player.play(program.stream_url, {
                title: program.title,
                subtitle: program.subtitle
            });
        }
    }

    async initializePlayer() {
        if (!window.EPGPlayer) {
            console.warn('EPGPlayer not available');
            return;
        }

        this.player = new window.EPGPlayer();
        await this.player.initialize();
    }

    showProgramDetails(channelId, programId) {
        const program = this.core.getProgram(channelId, programId);
        if (program) {
            this.ui.showProgramDetails(program);
        }
    }

    updateTimeDisplays() {
        // Update current time in sidebar
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = this.core.formatDateTime(now, 'datetime');
        }

        // Update progress bars for current events
        this.ui.updateProgressBars(this.core);
    }

    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            if (!this.core.isLoading) {
                this.loadData();
            }
        }, this.core.config.refreshInterval * 1000);
    }

    destroy() {
        // Cleanup
        document.removeEventListener('click', this.handleClick);
        document.removeEventListener('keydown', this.handleKeyboard);

        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
        }

        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }

        if (this.player) {
            this.player.destroy();
        }

        this.initialized = false;
    }
}

// Export for global access
window.EPGManager = EPGManager;