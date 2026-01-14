// ui/EPGUI.js - Facade class for backward compatibility
class EPGUI {
    constructor(core) {
        // Check if all required components are loaded
        if (!window.EPGUIMain) {
            console.error('EPGUIMain not loaded. Make sure all UI components are loaded in correct order.');
            return;
        }

        // Create the actual implementation
        this._impl = new EPGUIMain(core);

        // Initialize components after a short delay to ensure all are loaded
        setTimeout(() => {
            if (this._impl && this._impl.initializeComponents) {
                this._impl.initializeComponents();
            }
        }, 100);
    }

    // Proxy all public methods to the implementation
    renderCurrentEvents(channels, currentEvents) {
        return this._impl.renderCurrentEvents(channels, currentEvents);
    }

    showDailyPrograms(channel, programs) {
        return this._impl.showDailyPrograms(channel, programs);
    }

    closeDailyPrograms() {
        return this._impl.closeDailyPrograms();
    }

    showProgramDetails(program) {
        return this._impl.showProgramDetails(program);
    }

    closeProgramDetails() {
        return this._impl.closeProgramDetails();
    }

    updateDateDisplay(date) {
        return this._impl.updateDateDisplay(date);
    }

    updateProgressBars(core) {
        return this._impl.updateProgressBars(core);
    }

    showLoading(show) {
        return this._impl.showLoading(show);
    }

    showError(message) {
        return this._impl.showError(message);
    }

    addTimeBadgeCSS() {
        return this._impl.addTimeBadgeCSS();
    }

    addLogoFallback(container, channelName) {
        return this._impl.components.utilities.addLogoFallback(container, channelName);
    }

    createRatingBadge(rating) {
        return this._impl.components.utilities.createRatingBadge(rating);
    }

    escapeHtml(text) {
        return this._impl.components.utilities.escapeHtml(text);
    }
}

// Export for use
window.EPGUI = EPGUI;