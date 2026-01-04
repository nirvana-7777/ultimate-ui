/**
 * Ultimate UI - EPG Display Page JavaScript
 * Handles EPG display functionality, filtering, and player controls
 */

class EPGDisplayManager {
    constructor() {
        this.epgData = window.EPG_DATA || {};
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
    }

    init() {
        if (this.initialized) return;

        this.setupEventListeners();
        this.initializeComponents();
        this.startBackgroundTasks();

        this.initialized = true;
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

        // Channel toggle functionality
        document.addEventListener('click', (e) => {
            const channelHeader = e.target.closest('.channel-header');
            if (channelHeader) {
                const channelId = channelHeader.closest('.channel-card').getAttribute('data-channel-id');
                this.toggleChannelDetails(channelId);
            }
        });

        // Player controls
        const closePlayerBtn = document.getElementById('close-player-btn');
        if (closePlayerBtn) {
            closePlayerBtn.addEventListener('click', () => this.closePlayer());
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Play buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-play')) {
                const streamUrl = e.target.getAttribute('data-stream-url');
                const title = e.target.getAttribute('data-title');
                if (streamUrl && title) {
                    this.playProgram(streamUrl, title);
                }
            }
        });
    }

    initializeComponents() {
        // Initialize view based on screen size
        if (window.innerWidth < 768) {
            this.toggleView('list'); // Force list view on mobile
        } else {
            this.toggleView(this.currentView);
        }

        // Check for URL parameters
        this.handleUrlParameters();

        // Update live indicators
        this.updateLiveIndicators();
    }

    startBackgroundTasks() {
        // Update live indicators every minute
        this.liveIndicatorInterval = setInterval(() => this.updateLiveIndicators(), 60000);
    }

    // View management
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

            // Initialize grid view if needed
            if (gridView && gridView.children.length === 0) {
                this.initializeGridView();
            }
        }
    }

    // Filter management
    toggleFilterPanel() {
        const panel = document.getElementById('filter-panel');
        if (panel) {
            panel.classList.toggle('active');
        }
    }

    toggleCategory(category) {
        // Update UI
        document.querySelectorAll('.filter-tag').forEach(tag => {
            tag.classList.remove('active');
        });

        const activeTag = document.querySelector(`.filter-tag[data-category="${category}"]`);
        if (activeTag) {
            activeTag.classList.add('active');
        }

        // Update filter
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

                // Time filter logic
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

                // Category filter
                if (isVisible && this.filters.category !== 'all') {
                    const programCategory = program.querySelector('.program-category')?.textContent.toLowerCase() || '';
                    isVisible = programCategory === this.filters.category;
                }

                // Live filter
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

    // Channel management
    toggleChannelDetails(channelId) {
        const programsDiv = document.getElementById(`programs-${channelId}`);
        const toggleIcon = document.querySelector(`[data-channel-id="${channelId}"] .toggle-icon`);

        if (!programsDiv || !toggleIcon) return;

        if (programsDiv.style.display === 'none' || !programsDiv.style.display) {
            programsDiv.style.display = 'block';
            toggleIcon.textContent = '▲';
            this.storageSet(`channel-${channelId}-expanded`, true);
        } else {
            programsDiv.style.display = 'none';
            toggleIcon.textContent = '▼';
            this.storageSet(`channel-${channelId}-expanded`, false);
        }
    }

    updateLiveIndicators() {
        const now = new Date();

        // Get configured timezone from template data
        const templateData = document.getElementById('template-data');
        const configuredTimezone = templateData?.getAttribute('data-timezone') || 'Europe/Berlin';

        document.querySelectorAll('.program-item').forEach(program => {
            const startTime = new Date(program.getAttribute('data-start'));
            const endTime = new Date(program.getAttribute('data-end'));

            // Convert times to configured timezone for display
            const startStr = startTime.toLocaleTimeString('de-DE', {
                timeZone: configuredTimezone,
                hour: '2-digit',
                minute: '2-digit'
            });
            const endStr = endTime.toLocaleTimeString('de-DE', {
                timeZone: configuredTimezone,
                hour: '2-digit',
                minute: '2-digit'
            });

            // Update displayed times
            const startElement = program.querySelector('.start-time');
            const endElement = program.querySelector('.end-time');
            if (startElement && !startElement.textContent.includes(':')) {
                startElement.textContent = startStr;
            }
            if (endElement && !endElement.textContent.includes(':')) {
                endElement.textContent = endStr;
            }

            // Check if program is live (using browser's local time)
            if (startTime <= now && endTime >= now) {
                program.classList.add('live', 'laufend');
            } else {
                program.classList.remove('live', 'laufend');
            }
        });
    }

    // Time navigation
    navigateTime(direction) {
        this.currentDate.setDate(this.currentDate.getDate() + direction);

        const dateDisplay = document.getElementById('time-range');
        if (dateDisplay) {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            dateDisplay.textContent = this.currentDate.toLocaleDateString('de-DE', options);
        }

        window.showToast?.('Lade Programme für ' + this.currentDate.toLocaleDateString('de-DE'), 'info');
        // In a real implementation, you would load new EPG data here
    }

    // Player functionality
    async playProgram(streamUrl, title) {
        if (!streamUrl) {
            window.showToast?.('Kein Stream verfügbar', 'warning');
            return;
        }

        // Check if it's a DASH/HLS stream
        if (streamUrl.includes('.mpd') || streamUrl.includes('.m3u8')) {
            await this.initShakaPlayer(streamUrl, title);
        } else {
            // Regular video stream
            this.playRegularVideo(streamUrl, title);
        }
    }

    async initShakaPlayer(streamUrl, title) {
        const playerOverlay = document.getElementById('player-overlay');
        const video = document.getElementById('player-video');
        const playerTitle = document.getElementById('player-title');
        const bitrateSelector = document.getElementById('bitrate-selector');

        if (!playerOverlay || !video) {
            window.showToast?.('Player-Elemente nicht gefunden', 'error');
            return;
        }

        // Show player
        if (playerTitle) playerTitle.textContent = title;
        playerOverlay.classList.add('active');

        // Check if Shaka Player is available
        if (typeof shaka === 'undefined') {
            window.showToast?.('Shaka Player nicht geladen', 'error');
            return;
        }

        // Initialize player if not already done
        if (!this.player) {
            this.player = new shaka.Player(video);
            this.isPlayerInitialized = true;

            // Configure player
            this.player.configure({
                streaming: {
                    bufferingGoal: 30,
                    rebufferingGoal: 2
                }
            });

            // Set up bitrate selector
            if (bitrateSelector) {
                bitrateSelector.addEventListener('change', () => {
                    const value = bitrateSelector.value;
                    if (value === 'auto') {
                        this.player.configure({ abr: { enabled: true } });
                    } else {
                        this.player.configure({ abr: { enabled: false } });
                        const tracks = this.player.getVariantTracks();
                        const selected = tracks
                            .filter(t => t.bandwidth <= parseInt(value))
                            .sort((a, b) => b.height - a.height)[0];
                        if (selected) {
                            this.player.selectVariantTrack(selected, true);
                        }
                    }
                });
            }
        }

        try {
            // Load the stream
            await this.player.load(streamUrl);

            // Set initial volume and play
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

            // Fallback to regular video if possible
            if (streamUrl.includes('.mpd') || streamUrl.includes('.m3u8')) {
                // Try direct video source
                const directUrl = streamUrl.replace('.mpd', '.mp4').replace('.m3u8', '.mp4');
                this.playRegularVideo(directUrl, title);
            }
        }
    }

    playRegularVideo(streamUrl, title) {
        const playerOverlay = document.getElementById('player-overlay');
        const video = document.getElementById('player-video');
        const playerTitle = document.getElementById('player-title');
        const bitrateSelector = document.getElementById('bitrate-selector');

        if (!playerOverlay || !video) {
            window.showToast?.('Player-Elemente nicht gefunden', 'error');
            return;
        }

        // Hide bitrate selector for regular videos
        if (bitrateSelector) {
            bitrateSelector.style.display = 'none';
        }

        // Show player
        if (playerTitle) playerTitle.textContent = title;
        playerOverlay.classList.add('active');

        // Set video source and play
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
        const bitrateSelector = document.getElementById('bitrate-selector');

        if (playerOverlay) {
            playerOverlay.classList.remove('active');
        }

        if (video) {
            video.pause();
            video.src = '';
        }

        if (bitrateSelector) {
            bitrateSelector.style.display = 'block';
        }

        // Reset player if using Shaka
        if (this.player) {
            this.player.unload();
        }
    }

    // Grid view (placeholder implementation)
    initializeGridView() {
        const grid = document.getElementById('channels-grid');
        if (!grid) return;

        // This is a simplified implementation
        // In a real app, you would generate a proper time-based grid
        grid.innerHTML = `
            <div class="grid-placeholder">
                <p>Rasteransicht wird geladen...</p>
                <p><small>Diese Ansicht zeigt Programme in einem Zeitraster an.</small></p>
            </div>
        `;
    }

    // URL parameter handling
    handleUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const channelId = urlParams.get('channel');
        const programId = urlParams.get('program');

        if (channelId) {
            // Open channel details
            this.toggleChannelDetails(channelId);
        }

        if (programId) {
            // Highlight program
            this.highlightProgram(programId);
        }
    }

    highlightProgram(programId) {
        const programElement = document.querySelector(`[data-program-id="${programId}"]`);
        if (programElement) {
            programElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            programElement.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
            setTimeout(() => {
                programElement.style.backgroundColor = '';
            }, 3000);
        }
    }

    // Keyboard shortcuts
    handleKeyboardShortcuts(e) {
        // Escape: Close player or filter panel
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

        // F: Focus search
        if (e.key === 'f' || e.key === 'F') {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
        }

        // V: Toggle view
        if (e.key === 'v' || e.key === 'V') {
            e.preventDefault();
            const newView = this.currentView === 'list' ? 'grid' : 'list';
            this.toggleView(newView);
        }

        // Arrow keys for time navigation
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

    storageSet(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('LocalStorage set failed:', e);
        }
    }

    storageGet(key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (e) {
            console.warn('LocalStorage get failed:', e);
            return null;
        }
    }

    // Cleanup
    destroy() {
        if (this.liveIndicatorInterval) {
            clearInterval(this.liveIndicatorInterval);
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

    // Make available globally if needed
    window.epgDisplayManager = epgDisplayManager;

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        epgDisplayManager.destroy();
    });
});
