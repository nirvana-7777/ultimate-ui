/**
 * Enhanced EPG Display Manager - Client-Side Loading
 * Fixes: loading state, pagination, duplicates
 */

class EPGDisplayManager {
    constructor() {
        this.channels = [];
        this.currentView = 'list';
        this.currentDate = new Date();
        this.filters = {
            search: '',
            category: 'all',
            timeRange: 'today',
            onlyLive: false
        };
        this.player = null;
        this.isPlayerInitialized = false;
        this.initialized = false;
        this.liveIndicatorInterval = null;

        // Pagination
        this.channelsPerPage = 20;
        this.currentPage = 0;
        this.isLoading = false;
        this.hasMoreChannels = true;

        // IntersectionObserver for infinite scroll
        this.scrollObserver = null;
    }

    init() {
        if (this.initialized) return;

        this.setupEventListeners();
        this.setupInfiniteScroll();
        this.loadInitialData();
        this.startBackgroundTasks();

        this.initialized = true;
    }

    async loadInitialData() {
        // Hide any loading spinner from server
        const loadingState = document.querySelector('.loading-state');
        if (loadingState) {
            loadingState.style.display = 'none';
        }

        // Check if we have server-rendered data
        if (window.EPG_DATA && window.EPG_DATA.channels && window.EPG_DATA.channels.length > 0) {
            console.log('Using server-rendered EPG data');
            this.channels = window.EPG_DATA.channels;
            this.renderChannels(this.channels);
        } else {
            // Load from API
            console.log('Loading EPG data from API');
            await this.loadChannelsFromAPI();
        }

        // Show the list view
        const listView = document.getElementById('list-view');
        if (listView) {
            listView.style.display = 'block';
        }
    }

    async loadChannelsFromAPI(page = 0) {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoadingIndicator();

        try {
            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            // Fetch channels with pagination
            const response = await fetch('/api/epg/channels?page=' + page + '&limit=' + this.channelsPerPage);
            const data = await response.json();

            if (data.success && data.channels) {
                // For each channel, fetch programs
                const channelsWithPrograms = await Promise.all(
                    data.channels.map(async (channel) => {
                        try {
                            const programsResponse = await fetch(
                                `/api/channels/${channel.id}/programs?start=${now.toISOString()}&end=${tomorrow.toISOString()}`
                            );
                            const programs = await programsResponse.json();
                            channel.programs = programs.slice(0, 10); // Limit to 10 programs
                            return channel;
                        } catch (err) {
                            console.warn(`Failed to load programs for channel ${channel.id}:`, err);
                            channel.programs = [];
                            return channel;
                        }
                    })
                );

                if (page === 0) {
                    this.channels = channelsWithPrograms;
                } else {
                    this.channels = [...this.channels, ...channelsWithPrograms];
                }

                this.hasMoreChannels = data.has_more || channelsWithPrograms.length === this.channelsPerPage;
                this.renderChannels(channelsWithPrograms, page > 0);
            }
        } catch (error) {
            console.error('Error loading EPG data:', error);
            this.showError('Fehler beim Laden der EPG-Daten: ' + error.message);
        } finally {
            this.isLoading = false;
            this.hideLoadingIndicator();
        }
    }

    renderChannels(channels, append = false) {
        const listView = document.getElementById('list-view');
        if (!listView) return;

        // Clear existing content if not appending
        if (!append) {
            listView.innerHTML = '';
        }

        // Remove any existing sentinel
        const existingSentinel = document.getElementById('scroll-sentinel');
        if (existingSentinel) {
            existingSentinel.remove();
        }

        if (channels.length === 0 && !append) {
            listView.innerHTML = `
                <div class="empty-state">
                    <p>Keine Kanäle gefunden</p>
                    <p>Stellen Sie sicher, dass der WebEPG-Backend korrekt konfiguriert ist.</p>
                </div>
            `;
            return;
        }

        // Render each channel
        channels.forEach(channel => {
            const channelCard = this.createChannelCard(channel);
            listView.appendChild(channelCard);
        });

        // Add sentinel for infinite scroll
        if (this.hasMoreChannels) {
            const sentinel = document.createElement('div');
            sentinel.id = 'scroll-sentinel';
            sentinel.style.height = '1px';
            listView.appendChild(sentinel);

            // Observe the sentinel
            if (this.scrollObserver) {
                this.scrollObserver.observe(sentinel);
            }
        }

        // Update live indicators
        this.updateLiveIndicators();
    }

    createChannelCard(channel) {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.setAttribute('data-channel-id', channel.id);

        // Channel header
        const header = document.createElement('div');
        header.className = 'channel-header';
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');

        const channelInfo = document.createElement('div');
        channelInfo.className = 'channel-info';

        if (channel.icon_url) {
            const icon = document.createElement('img');
            icon.src = channel.icon_url;
            icon.alt = channel.display_name;
            icon.className = 'channel-icon';
            icon.onerror = function() { this.style.display = 'none'; };
            channelInfo.appendChild(icon);
        }

        const channelText = document.createElement('div');
        channelText.className = 'channel-text';
        channelText.innerHTML = `
            <h3 class="channel-name">${this.escapeHtml(channel.display_name)}</h3>
            <span class="channel-id">${this.escapeHtml(channel.name)}</span>
        `;
        channelInfo.appendChild(channelText);
        header.appendChild(channelInfo);

        const toggle = document.createElement('div');
        toggle.className = 'channel-toggle';
        toggle.innerHTML = '<span class="toggle-icon">▼</span>';
        header.appendChild(toggle);

        card.appendChild(header);

        // Programs container
        const programsDiv = document.createElement('div');
        programsDiv.className = 'channel-programs';
        programsDiv.id = `programs-${channel.id}`;
        programsDiv.style.display = 'none';

        if (channel.programs && channel.programs.length > 0) {
            channel.programs.forEach(program => {
                const programItem = this.createProgramItem(program);
                programsDiv.appendChild(programItem);
            });
        } else {
            programsDiv.innerHTML = '<div class="no-programs">Keine Programme in diesem Zeitraum</div>';
        }

        card.appendChild(programsDiv);

        // Add click handler
        header.addEventListener('click', () => {
            this.toggleChannelDetails(channel.id);
        });

        return card;
    }

    createProgramItem(program) {
        const item = document.createElement('div');
        item.className = 'program-item';
        item.setAttribute('data-start', program.start_time);
        item.setAttribute('data-end', program.end_time);
        if (program.id) {
            item.setAttribute('data-program-id', program.id);
        }

        const programTime = document.createElement('div');
        programTime.className = 'program-time';
        programTime.innerHTML = `
            <span class="start-time">${this.formatTime(program.start_time)}</span>
            <span class="time-separator">—</span>
            <span class="end-time">${this.formatTime(program.end_time)}</span>
        `;
        item.appendChild(programTime);

        const programDetails = document.createElement('div');
        programDetails.className = 'program-details';

        let detailsHTML = `<h4 class="program-title">${this.escapeHtml(program.title)}</h4>`;

        if (program.subtitle) {
            detailsHTML += `<p class="program-subtitle">${this.escapeHtml(program.subtitle)}</p>`;
        }

        if (program.description) {
            const truncated = program.description.length > 100
                ? program.description.substring(0, 100) + '...'
                : program.description;
            detailsHTML += `<p class="program-description">${this.escapeHtml(truncated)}</p>`;
        }

        if (program.category) {
            detailsHTML += `<span class="program-category">${this.escapeHtml(program.category)}</span>`;
        }

        if (program.stream) {
            detailsHTML += `
                <button class="btn-play" 
                        data-stream-url="${this.escapeHtml(program.stream)}"
                        data-title="${this.escapeHtml(program.title)}">
                    ▶ Abspielen
                </button>
            `;
        }

        programDetails.innerHTML = detailsHTML;
        item.appendChild(programDetails);

        return item;
    }

    setupInfiniteScroll() {
        this.scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && this.hasMoreChannels && !this.isLoading) {
                    console.log('Loading more channels...');
                    this.currentPage++;
                    this.loadChannelsFromAPI(this.currentPage);
                }
            });
        }, {
            root: null,
            rootMargin: '100px',
            threshold: 0.1
        });
    }

    setupEventListeners() {
        // Time navigation
        const prevBtn = document.getElementById('time-prev-btn');
        const nextBtn = document.getElementById('time-next-btn');

        if (prevBtn) prevBtn.addEventListener('click', () => this.navigateTime(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => this.navigateTime(1));

        // View toggle buttons
        const listViewBtn = document.getElementById('list-view-btn');
        const gridViewBtn = document.getElementById('grid-view-btn');

        if (listViewBtn) listViewBtn.addEventListener('click', () => this.toggleView('list'));
        if (gridViewBtn) gridViewBtn.addEventListener('click', () => this.toggleView('grid'));

        // Filter panel
        const filterBtn = document.getElementById('filter-btn');
        const closeFilterBtn = document.getElementById('close-filter-btn');

        if (filterBtn) filterBtn.addEventListener('click', () => this.toggleFilterPanel());
        if (closeFilterBtn) closeFilterBtn.addEventListener('click', () => this.toggleFilterPanel());

        // Filter inputs
        const searchInput = document.getElementById('search-input');
        const timeFilter = document.getElementById('time-filter');
        const categoryTags = document.querySelectorAll('.filter-tag');

        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => this.applyFilters(), 300));
        }

        if (timeFilter) {
            timeFilter.addEventListener('change', () => this.applyFilters());
        }

        categoryTags.forEach(tag => {
            tag.addEventListener('click', (e) => {
                const category = e.target.getAttribute('data-category');
                this.toggleCategory(category);
            });
        });

        // Player controls
        const closePlayerBtn = document.getElementById('close-player-btn');
        if (closePlayerBtn) {
            closePlayerBtn.addEventListener('click', () => this.closePlayer());
        }

        // Play buttons (event delegation)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-play')) {
                const streamUrl = e.target.getAttribute('data-stream-url');
                const title = e.target.getAttribute('data-title');
                if (streamUrl && title) {
                    this.playProgram(streamUrl, title);
                }
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    startBackgroundTasks() {
        // Update live indicators every minute
        this.liveIndicatorInterval = setInterval(() => this.updateLiveIndicators(), 60000);
    }

    toggleView(viewType) {
        this.currentView = viewType;

        const listView = document.getElementById('list-view');
        const gridView = document.getElementById('grid-view');
        const listBtn = document.getElementById('list-view-btn');
        const gridBtn = document.getElementById('grid-view-btn');

        if (viewType === 'list') {
            if (listView) listView.style.display = 'block';
            if (gridView) gridView.style.display = 'none';
            if (listBtn) listBtn.classList.add('active');
            if (gridBtn) gridBtn.classList.remove('active');
        } else {
            if (listView) listView.style.display = 'none';
            if (gridView) gridView.style.display = 'block';
            if (listBtn) listBtn.classList.remove('active');
            if (gridBtn) gridBtn.classList.add('active');

            if (gridView && gridView.children.length === 0) {
                this.initializeGridView();
            }
        }
    }

    toggleFilterPanel() {
        const panel = document.getElementById('filter-panel');
        if (panel) {
            panel.classList.toggle('active');
        }
    }

    toggleCategory(category) {
        document.querySelectorAll('.filter-tag').forEach(tag => {
            tag.classList.remove('active');
        });

        const activeTag = document.querySelector(`.filter-tag[data-category="${category}"]`);
        if (activeTag) {
            activeTag.classList.add('active');
        }

        this.filters.category = category;
        this.applyFilters();
    }

    applyFilters() {
        const searchInput = document.getElementById('search-input');
        const timeFilter = document.getElementById('time-filter');

        this.filters.search = searchInput?.value.toLowerCase() || '';
        this.filters.timeRange = timeFilter?.value || 'today';

        this.filterChannels();
    }

    filterChannels() {
        const searchTerm = this.filters.search.toLowerCase();
        const timeFilter = this.filters.timeRange;

        document.querySelectorAll('.channel-card').forEach(card => {
            const channelName = card.querySelector('.channel-name')?.textContent.toLowerCase() || '';
            const programs = card.querySelectorAll('.program-item');
            let hasVisiblePrograms = false;

            programs.forEach(program => {
                const programTitle = program.querySelector('.program-title')?.textContent.toLowerCase() || '';
                const programTime = program.getAttribute('data-start');
                let isVisible = programTitle.includes(searchTerm) || channelName.includes(searchTerm);

                if (isVisible && timeFilter !== 'all') {
                    const programDate = new Date(programTime);
                    const now = new Date();

                    switch(timeFilter) {
                        case 'now':
                            const endTime = new Date(program.getAttribute('data-end'));
                            isVisible = programDate <= now && endTime >= now;
                            break;
                        case 'today':
                            const today = now.toDateString();
                            isVisible = programDate.toDateString() === today;
                            break;
                        case 'tomorrow':
                            const tomorrow = new Date(now);
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            isVisible = programDate.toDateString() === tomorrow.toDateString();
                            break;
                        case 'week':
                            const weekEnd = new Date(now);
                            weekEnd.setDate(weekEnd.getDate() + 7);
                            isVisible = programDate >= now && programDate <= weekEnd;
                            break;
                    }
                }

                if (isVisible && this.filters.category !== 'all') {
                    const programCategory = program.querySelector('.program-category')?.textContent.toLowerCase() || '';
                    isVisible = programCategory === this.filters.category;
                }

                if (isVisible && this.filters.onlyLive) {
                    const isLive = program.classList.contains('live');
                    isVisible = isLive;
                }

                program.style.display = isVisible ? 'flex' : 'none';
                if (isVisible) hasVisiblePrograms = true;
            });

            card.style.display = hasVisiblePrograms ? 'block' : 'none';
        });
    }

    toggleChannelDetails(channelId) {
        const programsDiv = document.getElementById(`programs-${channelId}`);
        const card = document.querySelector(`[data-channel-id="${channelId}"]`);
        const toggleIcon = card?.querySelector('.toggle-icon');

        if (!programsDiv || !toggleIcon) return;

        if (programsDiv.style.display === 'none' || !programsDiv.style.display) {
            programsDiv.style.display = 'block';
            toggleIcon.textContent = '▲';
        } else {
            programsDiv.style.display = 'none';
            toggleIcon.textContent = '▼';
        }
    }

    updateLiveIndicators() {
        const now = new Date();

        document.querySelectorAll('.program-item').forEach(program => {
            const startTime = new Date(program.getAttribute('data-start'));
            const endTime = new Date(program.getAttribute('data-end'));

            if (startTime <= now && endTime >= now) {
                program.classList.add('live', 'laufend');
            } else {
                program.classList.remove('live', 'laufend');
            }
        });
    }

    navigateTime(direction) {
        this.currentDate.setDate(this.currentDate.getDate() + direction);

        const dateDisplay = document.getElementById('time-range');
        if (dateDisplay) {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            dateDisplay.textContent = this.currentDate.toLocaleDateString('de-DE', options);
        }

        window.showToast?.('Lade Programme für ' + this.currentDate.toLocaleDateString('de-DE'), 'info');

        // Reset and reload for new date
        this.currentPage = 0;
        this.hasMoreChannels = true;
        this.loadChannelsFromAPI(0);
    }

    async playProgram(streamUrl, title) {
        if (!streamUrl) {
            window.showToast?.('Kein Stream verfügbar', 'warning');
            return;
        }

        if (streamUrl.includes('.mpd') || streamUrl.includes('.m3u8')) {
            await this.initShakaPlayer(streamUrl, title);
        } else {
            this.playRegularVideo(streamUrl, title);
        }
    }

    async initShakaPlayer(streamUrl, title) {
        const playerOverlay = document.getElementById('player-overlay');
        const video = document.getElementById('player-video');
        const playerTitle = document.getElementById('player-title');

        if (!playerOverlay || !video) {
            window.showToast?.('Player-Elemente nicht gefunden', 'error');
            return;
        }

        if (playerTitle) playerTitle.textContent = title;
        playerOverlay.classList.add('active');

        if (typeof shaka === 'undefined') {
            window.showToast?.('Shaka Player nicht geladen', 'error');
            return;
        }

        if (!this.player) {
            this.player = new shaka.Player(video);
            this.player.configure({
                streaming: {
                    bufferingGoal: 30,
                    rebufferingGoal: 2
                }
            });
        }

        try {
            await this.player.load(streamUrl);
            video.volume = 0.1;
            video.muted = false;
            await video.play().catch(e => {
                console.warn('Autoplay blocked:', e);
                window.showToast?.('Klicken Sie auf Play, um den Stream zu starten', 'info');
            });
            window.showToast?.('Stream wird geladen...', 'success');
        } catch (error) {
            console.error('Error loading stream:', error);
            window.showToast?.(`Fehler beim Laden des Streams: ${error.message}`, 'error');
        }
    }

    playRegularVideo(streamUrl, title) {
        const playerOverlay = document.getElementById('player-overlay');
        const video = document.getElementById('player-video');
        const playerTitle = document.getElementById('player-title');

        if (!playerOverlay || !video) {
            window.showToast?.('Player-Elemente nicht gefunden', 'error');
            return;
        }

        if (playerTitle) playerTitle.textContent = title;
        playerOverlay.classList.add('active');

        video.src = streamUrl;
        video.volume = 0.1;
        video.muted = false;
        video.load();
        video.play().catch(e => {
            console.warn('Autoplay blocked:', e);
            window.showToast?.('Klicken Sie auf Play, um den Stream zu starten', 'info');
        });

        window.showToast?.('Stream wird geladen...', 'success');
    }

    closePlayer() {
        const playerOverlay = document.getElementById('player-overlay');
        const video = document.getElementById('player-video');

        if (playerOverlay) {
            playerOverlay.classList.remove('active');
        }

        if (video) {
            video.pause();
            video.src = '';
        }

        if (this.player) {
            this.player.unload();
        }
    }

    initializeGridView() {
        const grid = document.getElementById('channels-grid');
        if (!grid) return;

        grid.innerHTML = `
            <div class="grid-placeholder">
                <p>Rasteransicht wird geladen...</p>
                <p><small>Diese Ansicht zeigt Programme in einem Zeitraster an.</small></p>
            </div>
        `;
    }

    handleKeyboardShortcuts(e) {
        if (e.key === 'Escape') {
            const playerOverlay = document.getElementById('player-overlay');
            if (playerOverlay && playerOverlay.classList.contains('active')) {
                this.closePlayer();
            }

            const filterPanel = document.getElementById('filter-panel');
            if (filterPanel && filterPanel.classList.contains('active')) {
                this.toggleFilterPanel();
            }
        }

        if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey) {
            const searchInput = document.getElementById('search-input');
            if (searchInput && document.activeElement !== searchInput) {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
        }

        if (e.key === 'v' || e.key === 'V') {
            e.preventDefault();
            const newView = this.currentView === 'list' ? 'grid' : 'list';
            this.toggleView(newView);
        }

        if (e.key === 'ArrowLeft') {
            const prevBtn = document.getElementById('time-prev-btn');
            if (prevBtn) prevBtn.click();
        }

        if (e.key === 'ArrowRight') {
            const nextBtn = document.getElementById('time-next-btn');
            if (nextBtn) nextBtn.click();
        }
    }

    // Utility functions
    formatTime(value) {
        if (!value) return '';
        try {
            const date = new Date(value);
            return date.toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return value;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    showLoadingIndicator() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.style.display = 'flex';
    }

    hideLoadingIndicator() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.style.display = 'none';
    }

    showError(message) {
        const listView = document.getElementById('list-view');
        if (listView) {
            listView.innerHTML = `
                <div class="error-message" role="alert">
                    <p>⚠️ ${this.escapeHtml(message)}</p>
                    <button onclick="location.reload()">Erneut versuchen</button>
                </div>
            `;
        }
        window.showToast?.(message, 'error');
    }

    async refreshData() {
        console.log('Refreshing EPG data...');

        // Reset pagination
        this.currentPage = 0;
        this.hasMoreChannels = true;

        // Clear existing channels
        this.channels = [];

        // Reload from API
        await this.loadChannelsFromAPI(0);

        if (window.showToast) {
            window.showToast('EPG-Daten aktualisiert', 'success');
        }
    }

    destroy() {
        if (this.liveIndicatorInterval) {
            clearInterval(this.liveIndicatorInterval);
        }

        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
        }

        if (this.player) {
            this.player.destroy();
            this.player = null;
        }

        this.initialized = false;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const epgDisplayManager = new EPGDisplayManager();
    epgDisplayManager.init();

    window.epgDisplayManager = epgDisplayManager;

    window.addEventListener('beforeunload', () => {
        epgDisplayManager.destroy();
    });
});