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
        if (this.epgUI.getIsLoadingMorePrograms()) return;

        const channel = this.core.getChannel(channelId);
        if (!channel || this.epgUI.getCurrentLoadingChannel() !== channelId) return;

        const content = document.getElementById('daily-programs-content');
        if (!content) return;

        const channelCard = content.querySelector('.channel-daily-expanded');
        if (!channelCard) return;

        const cards = channelCard.querySelectorAll('.daily-program-card-expanded');
        if (cards.length === 0) return;

        // NOTE: card dataset.programId is stored RAW by the renderer (only the
        // button attributes are URI-encoded) - do not decode it here.
        const lastKey = String(cards[cards.length - 1].dataset.programId);

        // Search EVERY stored day of this channel (Map order is insertion order,
        // not the order on screen), plus today's volatile store.
        const prefix = `${channelId}|`;
        const all = [];
        for (const [key, arr] of this.core.pastProgramsByDay) {
            if (key.startsWith(prefix)) all.push(...arr);
        }
        all.push(...(this.core.dailyPrograms.get(channelId) || []));

        let lastProgram = all.find(p => this.core.programKey(channelId, p) === lastKey);
        if (!lastProgram && all.length > 0) {
            lastProgram = all.reduce((m, p) =>
                this.core.parseProgramTime(p.end_time) > this.core.parseProgramTime(m.end_time) ? p : m);
        }
        if (!lastProgram) return;

        const loadMoreBtn = content.querySelector('.load-more-programs-btn');
        if (!loadMoreBtn) return;

        const markNoMore = () => {
            loadMoreBtn.disabled = true;
            loadMoreBtn.innerHTML = 'Keine weiteren Programme verfügbar';
            loadMoreBtn.style.cursor = 'default';
            loadMoreBtn.style.opacity = '0.6';
            if (this.dailyProgramsInfiniteScroll) this.dailyProgramsInfiniteScroll.disconnect();
        };

        // Next day after the last program. -1 ms: a program ending exactly at
        // 00:00 belongs to the previous day. Ceiling = tomorrow (EPG horizon,
        // same as navigateDate in epg_manager.js).
        const lastEnd = this.core.parseProgramTime(lastProgram.end_time);
        const nextDayStart = new Date(lastEnd.getTime() - 1);
        nextDayStart.setHours(0, 0, 0, 0);
        nextDayStart.setDate(nextDayStart.getDate() + 1);
        const ceil = new Date(); ceil.setHours(0, 0, 0, 0); ceil.setDate(ceil.getDate() + 1);
        if (nextDayStart > ceil) { markNoMore(); return; }

        this.epgUI.setIsLoadingMorePrograms(true);
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = 'Lädt mehr Programme...';
        loadMoreBtn.style.cursor = 'wait';
        loadMoreBtn.style.backgroundColor = 'var(--bg-tertiary)';

        try {
            const newPrograms = await this.core.loadDailyProgramsForChannel(channelId, nextDayStart);

            if (newPrograms.length > 0) {
                const renderer = this.epgUI.components.renderer;
                newPrograms.forEach(program => {
                    channelCard.appendChild(renderer.createDailyProgramCardExpanded(channel, program));
                });
                loadMoreBtn.disabled = false;
                loadMoreBtn.innerHTML = '▼ Mehr Programme laden';
                loadMoreBtn.style.cursor = 'pointer';
            } else {
                markNoMore();
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