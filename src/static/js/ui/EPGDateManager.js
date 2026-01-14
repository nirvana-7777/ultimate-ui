// ui/EPGDateManager.js - Date and time operations
class EPGDateManager {
    constructor(epgUI) {
        this.epgUI = epgUI;
        this.core = epgUI.core;
    }

    updateDateDisplay(date) {
        const displayElement = document.getElementById('date-display');
        const todayBtn = document.getElementById('date-today-btn');

        if (displayElement) {
            displayElement.textContent = this.core.formatDateTime(date, 'date');
        }

        if (todayBtn) {
            const today = new Date();
            const isToday = date.toDateString() === today.toDateString();
            todayBtn.classList.toggle('active', isToday);
        }
    }

    updateProgressBars(core) {
        document.querySelectorAll('.channel-now-card').forEach(card => {
            const channelId = card.dataset.channelId;
            const program = core.currentEvents.get(channelId);

            if (program && program.progress) {
                const progressFill = card.querySelector('.progress-fill');
                const timeRemaining = card.querySelector('.time-remaining-left');

                if (progressFill) {
                    const progress = core.calculateProgress(program.start_time, program.end_time);
                    if (progress) {
                        progressFill.style.width = `${progress.percentage}%`;
                    }
                }

                if (timeRemaining) {
                    timeRemaining.textContent = core.calculateTimeRemaining(program.end_time);
                }
            }
        });
    }
}

// Export for use
window.EPGDateManager = EPGDateManager;