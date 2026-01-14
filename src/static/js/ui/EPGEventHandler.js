// ui/EPGEventHandler.js - Event listener management
class EPGEventHandler {
    constructor(epgUI) {
        this.epgUI = epgUI;
        this.core = epgUI.core;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Play button event delegation
        document.addEventListener('click', (e) => {
            this.handlePlayButtonClick(e);
            this.handleExpandButtonClick(e);
        });

        // Close daily programs button
        const closeDailyBtn = document.getElementById('close-daily-btn');
        if (closeDailyBtn) {
            closeDailyBtn.addEventListener('click', () => {
                this.epgUI.closeDailyPrograms();
            });
        }
    }

    handlePlayButtonClick(e) {
        const playBtn = e.target.closest('.btn-play-tile, .btn-play-channel, .btn-play');
        if (!playBtn) return;

        e.preventDefault();
        e.stopPropagation();

        const channelId = playBtn.dataset.channelId;
        const programId = playBtn.dataset.programId;

        if (playBtn.classList.contains('btn-play-channel')) {
            // Provider channel - play directly
            document.dispatchEvent(new CustomEvent('play-channel', {
                detail: { channelId }
            }));
        } else {
            // Regular program
            document.dispatchEvent(new CustomEvent('play-program', {
                detail: { channelId, programId }
            }));
        }
    }

    handleExpandButtonClick(e) {
        const expandBtn = e.target.closest('.expand-daily-btn');
        if (!expandBtn) return;

        e.preventDefault();
        e.stopPropagation();

        const channelId = expandBtn.dataset.channelId;
        const channel = this.core.getChannel(channelId);
        const programs = this.core.dailyPrograms.get(channelId);

        if (channel && programs) {
            this.epgUI.showDailyPrograms(channel, programs);
        }
    }
}

// Export for use
window.EPGEventHandler = EPGEventHandler;