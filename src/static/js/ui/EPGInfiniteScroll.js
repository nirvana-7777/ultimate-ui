// ui/EPGInfiniteScroll.js - Infinite scroll and pagination
class EPGInfiniteScroll {
    constructor(epgUI) {
        this.epgUI = epgUI;
        this.core = epgUI.core;
        this.dailyProgramsInfiniteScroll = null;
    }

    setupDailyProgramsInfiniteScroll(channelId) {
        if (this.dailyProgramsInfiniteScroll) {
            this.dailyProgramsInfiniteScroll.disconnect();
            this.dailyProgramsInfiniteScroll = null;
        }

        const loadMoreBtn = document.querySelector('.load-more-programs-btn');
        if (!loadMoreBtn) {
            console.warn('Load more button not found');
            return;
        }

        this.dailyProgramsInfiniteScroll = new IntersectionObserver(async (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting &&
                    this.epgUI.getCurrentLoadingChannel() === channelId &&
                    !this.epgUI.getIsLoadingMorePrograms()) {

                    const btn = entry.target;
                    if (btn.disabled && btn.innerHTML === 'Keine weiteren Programme verfügbar') {
                        return;
                    }

                    await this.loadMoreDailyPrograms(channelId);
                }
            }
        }, {
            root: null,
            rootMargin: '500px',
            threshold: 0.1
        });

        this.dailyProgramsInfiniteScroll.observe(loadMoreBtn);
    }

    async loadMoreDailyPrograms(channelId) {
        if (this.epgUI.getIsLoadingMorePrograms()) {
            console.log('Already loading more programs, skipping...');
            return;
        }

        const channel = this.core.getChannel(channelId);
        if (!channel || this.epgUI.getCurrentLoadingChannel() !== channelId) {
            console.log('Channel not found or not current channel');
            return;
        }

        const content = document.getElementById('daily-programs-content');
        if (!content) return;

        const channelCard = content.querySelector('.channel-daily-expanded');
        if (!channelCard) {
            console.log('Channel card not found');
            return;
        }

        const allProgramCards = channelCard.querySelectorAll('.daily-program-card-expanded');
        if (allProgramCards.length === 0) {
            console.log('No program cards found');
            return;
        }

        const lastProgramCard = allProgramCards[allProgramCards.length - 1];
        const lastProgramId = lastProgramCard.dataset.programId;

        const allPrograms = this.core.dailyPrograms.get(channelId);

        let lastProgram = null;
        if (allPrograms && allPrograms.length > 0) {
            lastProgram = allPrograms.find(p => String(p.id) === String(lastProgramId));

            if (!lastProgram) {
                lastProgram = allPrograms[allPrograms.length - 1];
            }
        }

        if (!lastProgram) {
            console.log('Could not find last program');
            return;
        }

        const loadMoreBtn = content.querySelector('.load-more-programs-btn');
        if (!loadMoreBtn) return;

        this.epgUI.setIsLoadingMorePrograms(true);
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = 'Lädt mehr Programme...';
        loadMoreBtn.style.cursor = 'wait';
        loadMoreBtn.style.backgroundColor = 'var(--bg-tertiary)';

        try {
            const newPrograms = await this.core.loadNextDayForChannel(
                channelId,
                lastProgram.end_time
            );

            if (newPrograms.length > 0) {
                // We need to access the renderer through epgUI
                const renderer = this.epgUI.components.renderer;
                newPrograms.forEach(program => {
                    const programElement = renderer.createDailyProgramCardExpanded(channel, program);
                    channelCard.appendChild(programElement);
                });

                loadMoreBtn.disabled = false;
                loadMoreBtn.innerHTML = '▼ Mehr Programme laden';
                loadMoreBtn.style.cursor = 'pointer';
            } else {
                loadMoreBtn.disabled = true;
                loadMoreBtn.innerHTML = 'Keine weiteren Programme verfügbar';
                loadMoreBtn.style.cursor = 'default';
                loadMoreBtn.style.opacity = '0.6';

                if (this.dailyProgramsInfiniteScroll) {
                    this.dailyProgramsInfiniteScroll.disconnect();
                }
            }
        } catch (error) {
            console.error('Error loading more programs:', error);
            loadMoreBtn.disabled = false;
            loadMoreBtn.innerHTML = '▼ Mehr Programme laden (Erneut versuchen)';
            loadMoreBtn.style.cursor = 'pointer';
        } finally {
            this.epgUI.setIsLoadingMorePrograms(false);
        }
    }

    disconnect() {
        if (this.dailyProgramsInfiniteScroll) {
            this.dailyProgramsInfiniteScroll.disconnect();
            this.dailyProgramsInfiniteScroll = null;
        }
    }

    setupForChannel(channelId) {
        this.setupDailyProgramsInfiniteScroll(channelId);
    }
}

// Export for use
window.EPGInfiniteScroll = EPGInfiniteScroll;