// ui/EPGUIMain.js - Main orchestrator class
class EPGUIMain {
    constructor(core) {
        this.core = core;
        this.expandedChannels = new Set();
        this.currentModal = null;
        this.dailyProgramsInfiniteScroll = null;
        this.currentLoadingChannel = null;
        this.isLoadingMorePrograms = false;

        // Initialize components
        this.components = {
            renderer: new EPGRenderer(this),
            modalManager: new EPGModalManager(this),
            infiniteScroll: new EPGInfiniteScroll(this),
            dateManager: new EPGDateManager(this),
            utilities: new EPGUtilities(),
            eventHandler: new EPGEventHandler(this)
        };
    }

    // High-level rendering methods
    renderCurrentEvents(channels, currentEvents) {
        this.components.renderer.renderCurrentEvents(channels, currentEvents);
    }

    showDailyPrograms(channel, programs) {
        this.components.renderer.showDailyPrograms(channel, programs);
        this.components.infiniteScroll.setupForChannel(channel.id);
    }

    closeDailyPrograms() {
        this.components.infiniteScroll.disconnect();
        this.currentLoadingChannel = null;

        const container = document.getElementById('daily-programs-container');
        const currentEventsGrid = document.getElementById('current-events-grid');

        if (container) {
            container.classList.add('hiding');
            setTimeout(() => {
                container.style.display = 'none';
                container.classList.remove('active', 'hiding');
            }, 300);
        }

        if (currentEventsGrid) {
            currentEventsGrid.style.display = 'grid';
            void currentEventsGrid.offsetWidth;
            currentEventsGrid.classList.remove('hiding');
            currentEventsGrid.classList.add('showing');
            setTimeout(() => {
                currentEventsGrid.classList.remove('showing');
            }, 300);
        }
    }

    // Modal management
    showProgramDetails(program) {
        this.components.modalManager.showProgramDetails(program);
    }

    closeProgramDetails() {
        this.components.modalManager.closeProgramDetails();
    }

    // Date/time management
    updateDateDisplay(date) {
        this.components.dateManager.updateDateDisplay(date);
    }

    updateProgressBars(core) {
        this.components.dateManager.updateProgressBars(core);
    }

    // Utility methods
    showLoading(show) {
        this.components.utilities.showLoading(show);
    }

    showError(message) {
        this.components.utilities.showError(message);
    }

    addTimeBadgeCSS() {
        this.components.utilities.addTimeBadgeCSS();
    }

    // Getters
    getCurrentModal() {
        return this.currentModal;
    }

    setCurrentModal(modal) {
        this.currentModal = modal;
    }

    getCurrentLoadingChannel() {
        return this.currentLoadingChannel;
    }

    setCurrentLoadingChannel(channelId) {
        this.currentLoadingChannel = channelId;
    }

    getIsLoadingMorePrograms() {
        return this.isLoadingMorePrograms;
    }

    setIsLoadingMorePrograms(loading) {
        this.isLoadingMorePrograms = loading;
    }
}

// Export for use
window.EPGUIMain = EPGUIMain;