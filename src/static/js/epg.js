/**
 * Ultimate UI - EPG JavaScript - FIXED VERSION
 * Handles EPG display, program filtering, and Shaka Player integration
 */

class EPGManager {
    constructor() {
        this.channels = [];
        this.programs = new Map(); // channelId -> programs
        this.filters = {
            search: '',
            category: 'all',
            timeRange: 'today',
            onlyLive: false
        };
        this.currentView = 'list'; // 'list' or 'grid'
        this.currentDate = new Date();
        this.player = null;
        this.isPlayerInitialized = false;
    }

    async loadEPGData() {
        try {
            window.showLoading?.('Lade EPG-Daten...');

            // Load channels - FIXED: use correct endpoint
            const response = await fetch('/api/epg/refresh');
            const data = await response.json();

            this.channels = data.success ? data.channels : [];

            // Load programs for each channel
            await this.loadProgramsForChannels();

            this.renderEPG();
            this.updateStats();

            window.hideLoading?.();

            if (data.success) {
                window.showToast?.(`EPG-Daten geladen: ${this.channels.length} Kanäle`, 'success');
            }

        } catch (error) {
            window.hideLoading?.();
            console.error('Failed to load EPG data:', error);
            window.showToast?.('Fehler beim Laden der EPG-Daten', 'error');
        }
    }

    async loadProgramsForChannels() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Limit to first 20 channels for performance
        const channelsToLoad = this.channels.slice(0, 20);

        const promises = channelsToLoad.map(async (channel) => {
            try {
                // FIXED: Use correct API endpoint (proxy through Flask)
                const response = await fetch(
                    `/api/channels/${channel.id}/programs?start=${now.toISOString()}&end=${tomorrow.toISOString()}`
                );

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const programs = await response.json();
                this.programs.set(channel.id, Array.isArray(programs) ? programs : []);
            } catch (error) {
                console.error(`Failed to load programs for channel ${channel.id}:`, error);
                this.programs.set(channel.id, []);
            }
        });

        await Promise.all(promises);
    }

    renderEPG() {
        const container = document.getElementById('epg-content');
        if (!container) return;

        if (this.currentView === 'list') {
            this.renderListView(container);
        } else {
            this.renderGridView(container);
        }

        this.updateLiveIndicators();
        this.setupEventListeners();
    }

    renderListView(container) {
        let html = '<div class="epg-list-view">';

        this.channels.forEach(channel => {
            const programs = this.programs.get(channel.id) || [];
            const filteredPrograms = this.filterPrograms(programs);

            if (filteredPrograms.length === 0 && this.filters.search) {
                return; // Skip channel if no programs match search
            }

            // FIXED: Use safe storage access
            const isExpanded = this.storageGet(`channel-${channel.id}-expanded`) || false;

            html += `
                <div class="channel-card" data-channel-id="${channel.id}">
                    <div class="channel-header" onclick="window.EPG.toggleChannel('${channel.id}')">
                        <div class="channel-info">
                            ${channel.icon_url ? 
                                `<img src="${this.escapeHtml(channel.icon_url)}" alt="${this.escapeHtml(channel.display_name)}" 
                                      class="channel-icon" onerror="this.style.display='none'">` : ''}
                            <div class="channel-text">
                                <h3 class="channel-name">${this.escapeHtml(channel.display_name)}</h3>
                                <span class="channel-id">${this.escapeHtml(channel.name)}</span>
                            </div>
                        </div>
                        <div class="channel-toggle">
                            <span class="toggle-icon">${isExpanded ? '▲' : '▼'}</span>
                        </div>
                    </div>
                    
                    <div class="channel-programs" id="programs-${channel.id}" 
                         style="display: ${isExpanded ? 'block' : 'none'}">
                        ${this.renderProgramsList(filteredPrograms, channel)}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    renderProgramsList(programs, channel) {
        if (programs.length === 0) {
            return '<div class="no-programs">Keine Programme gefunden</div>';
        }

        return programs.map(program => {
            const isLive = this.isProgramLive(program);
            const isCurrent = this.isProgramCurrent(program);

            return `
                <div class="program-item ${isLive ? 'live' : ''} ${isCurrent ? 'laufend' : ''}" 
                     data-program-id="${program.id || ''}"
                     data-start="${program.start_time || ''}"
                     data-end="${program.end_time || ''}">
                    <div class="program-time">
                        <span class="start-time">${this.formatTime(program.start_time)}</span>
                        <span class="time-separator">–</span>
                        <span class="end-time">${this.formatTime(program.end_time)}</span>
                    </div>
                    <div class="program-details">
                        <h4 class="program-title">
                            ${this.escapeHtml(program.title)}
                            ${isLive ? '<span class="live-badge">LIVE</span>' : ''}
                        </h4>
                        ${program.subtitle ? `<p class="program-subtitle">${this.escapeHtml(program.subtitle)}</p>` : ''}
                        ${program.description ? 
                            `<p class="program-description">${this.escapeHtml(this.truncateText(program.description, 120))}</p>` : ''}
                        ${program.category ? `<span class="program-category">${this.escapeHtml(program.category)}</span>` : ''}
                        ${program.stream ? `
                            <button class="btn-play" onclick="window.EPG.playProgram('${this.escapeHtml(program.stream)}', '${this.escapeHtml(program.title)}')">
                                ▶ Abspielen
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderGridView(container) {
        // Grid view implementation
        container.innerHTML = `
            <div class="epg-grid-view">
                <div class="grid-header">
                    <div class="time-slots"></div>
                </div>
                <div class="channels-grid" id="channels-grid">
                    <!-- Grid will be populated by JavaScript -->
                </div>
            </div>
        `;

        this.renderGridContent();
    }

    renderGridContent() {
        const grid = document.getElementById('channels-grid');
        if (!grid) return;

        let html = '';

        this.channels.slice(0, 10).forEach(channel => {
            const programs = this.programs.get(channel.id) || [];
            const nextProgram = programs[0];

            html += `
                <div class="grid-channel" data-channel-id="${channel.id}">
                    <div class="grid-channel-header">
                        ${channel.icon_url ? 
                            `<img src="${this.escapeHtml(channel.icon_url)}" alt="${this.escapeHtml(channel.display_name)}" 
                                  class="channel-icon-small">` : ''}
                        <span class="grid-channel-name">${this.escapeHtml(channel.display_name)}</span>
                    </div>
                    ${nextProgram ? `
                        <div class="grid-program" onclick="window.EPG.playProgram('${this.escapeHtml(nextProgram.stream || '')}', '${this.escapeHtml(nextProgram.title)}')">
                            <span class="grid-program-time">
                                ${this.formatTime(nextProgram.start_time)}
                            </span>
                            <span class="grid-program-title">${this.escapeHtml(nextProgram.title)}</span>
                        </div>
                    ` : '<div class="grid-program empty">Kein Programm</div>'}
                </div>
            `;
        });

        grid.innerHTML = html;
    }

    filterPrograms(programs) {
        return programs.filter(program => {
            // Search filter
            if (this.filters.search) {
                const searchTerm = this.filters.search.toLowerCase();
                const matches = program.title.toLowerCase().includes(searchTerm) ||
                              (program.description && program.description.toLowerCase().includes(searchTerm)) ||
                              (program.subtitle && program.subtitle.toLowerCase().includes(searchTerm));
                if (!matches) return false;
            }

            // Category filter
            if (this.filters.category !== 'all' && program.category !== this.filters.category) {
                return false;
            }

            // Live filter
            if (this.filters.onlyLive && !this.isProgramLive(program)) {
                return false;
            }

            // Time range filter
            const programStart = new Date(program.start_time);
            const now = new Date();

            switch (this.filters.timeRange) {
                case 'now':
                    return this.isProgramCurrent(program);
                case 'today':
                    return programStart.toDateString() === now.toDateString();
                case 'tomorrow':
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    return programStart.toDateString() === tomorrow.toDateString();
                case 'week':
                    const weekEnd = new Date(now);
                    weekEnd.setDate(weekEnd.getDate() + 7);
                    return programStart >= now && programStart <= weekEnd;
                default:
                    return true;
            }
        });
    }

    isProgramLive(program) {
        if (!program.start_time || !program.end_time) return false;
        const now = new Date();
        const start = new Date(program.start_time);
        const end = new Date(program.end_time);
        return now >= start && now <= end;
    }

    isProgramCurrent(program) {
        return this.isProgramLive(program);
    }

    toggleChannel(channelId) {
        const programsDiv = document.getElementById(`programs-${channelId}`);
        const toggleIcon = document.querySelector(`[data-channel-id="${channelId}"] .toggle-icon`);

        if (!programsDiv || !toggleIcon) return;

        const isExpanded = programsDiv.style.display !== 'none';

        if (isExpanded) {
            programsDiv.style.display = 'none';
            toggleIcon.textContent = '▼';
            this.storageSet(`channel-${channelId}-expanded`, false);
        } else {
            programsDiv.style.display = 'block';
            toggleIcon.textContent = '▲';
            this.storageSet(`channel-${channelId}-expanded`, true);
        }
    }

    toggleView(viewType) {
        this.currentView = viewType;
        this.renderEPG();

        // Update UI buttons
        document.querySelectorAll('.btn-view-toggle').forEach(btn => {
            btn.classList.remove('active');
        });
        const viewButton = document.querySelector(`.btn-view-toggle[onclick*="${viewType}"]`);
        if (viewButton) {
            viewButton.classList.add('active');
        }
    }

    applyFilters() {
        const searchInput = document.getElementById('search-input');
        const categoryFilter = document.getElementById('category-filter');
        const timeFilter = document.getElementById('time-filter');
        const liveFilter = document.getElementById('live-filter');

        this.filters = {
            search: searchInput ? searchInput.value : '',
            category: categoryFilter ? categoryFilter.value : 'all',
            timeRange: timeFilter ? timeFilter.value : 'today',
            onlyLive: liveFilter ? liveFilter.checked : false
        };

        this.renderEPG();
    }

    updateLiveIndicators() {
        const now = new Date();

        document.querySelectorAll('.program-item').forEach(item => {
            const startTime = item.dataset.start ? new Date(item.dataset.start) : null;
            const endTime = item.dataset.end ? new Date(item.dataset.end) : null;

            if (startTime && endTime && now >= startTime && now <= endTime) {
                item.classList.add('live', 'laufend');
            } else {
                item.classList.remove('live', 'laufend');
            }
        });
    }

    updateStats() {
        const totalPrograms = Array.from(this.programs.values())
            .reduce((sum, programs) => sum + programs.length, 0);

        const livePrograms = Array.from(this.programs.values())
            .flat()
            .filter(program => this.isProgramLive(program))
            .length;

        const totalChannelsDisplay = document.getElementById('total-channels-display');
        const totalProgramsDisplay = document.getElementById('total-programs-display');
        const liveProgramsDisplay = document.getElementById('live-programs-display');

        if (totalChannelsDisplay) totalChannelsDisplay.textContent = this.channels.length;
        if (totalProgramsDisplay) totalProgramsDisplay.textContent = totalPrograms;
        if (liveProgramsDisplay) liveProgramsDisplay.textContent = livePrograms;
    }

    async playProgram(streamUrl, title) {
        if (!streamUrl) {
            window.showToast?.('Kein Stream verfügbar', 'warning');
            return;
        }

        // Check if Shaka Player is available
        if (typeof shaka === 'undefined') {
            window.showToast?.('Shaka Player nicht geladen - verwende Standard-Player', 'warning');
            this.playRegularVideo(streamUrl, title);
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
        playerTitle.textContent = title;
        playerOverlay.classList.add('active');

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

            // Fallback to regular video
            this.playRegularVideo(streamUrl, title);
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
        playerTitle.textContent = title;
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
            this.player.unload().catch(e => console.warn('Error unloading player:', e));
        }
    }

    setupEventListeners() {
        // Close player with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const playerOverlay = document.getElementById('player-overlay');
                if (playerOverlay && playerOverlay.classList.contains('active')) {
                    this.closePlayer();
                }
            }
        });

        // Update live indicators every minute
        setInterval(() => this.updateLiveIndicators(), 60000);

        // Auto-refresh EPG data every 5 minutes
        setInterval(() => this.loadEPGData(), 5 * 60 * 1000);
    }

    // Utility methods - ADDED
    formatTime(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    storageSet(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('LocalStorage not available:', e);
        }
    }

    storageGet(key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (e) {
            console.warn('LocalStorage not available:', e);
            return null;
        }
    }

    navigateTime(direction) {
        // Navigate to next/previous day
        this.currentDate.setDate(this.currentDate.getDate() + direction);
        this.loadEPGData();

        // Update UI
        const dateDisplay = document.getElementById('current-date-display');
        if (dateDisplay) {
            dateDisplay.textContent = this.formatDate(this.currentDate);
        }
    }

    formatDate(date) {
        return date.toLocaleDateString('de-DE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    exportEPG() {
        const data = {
            channels: this.channels,
            programs: Object.fromEntries(this.programs),
            timestamp: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `epg-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        window.showToast?.('EPG-Daten exportiert', 'success');
    }
}

// Initialize EPG manager
const EPG = new EPGManager();

// Make EPG available globally
window.EPG = EPG;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only load EPG data if we're on the EPG page
    const epgContent = document.getElementById('epg-content');
    if (epgContent) {
        EPG.loadEPGData();
    }

    // Set up filter listeners
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const timeFilter = document.getElementById('time-filter');
    const liveFilter = document.getElementById('live-filter');

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => EPG.applyFilters(), 300));
    }

    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => EPG.applyFilters());
    }

    if (timeFilter) {
        timeFilter.addEventListener('change', () => EPG.applyFilters());
    }

    if (liveFilter) {
        liveFilter.addEventListener('change', () => EPG.applyFilters());
    }

    // Set up view toggle buttons
    document.querySelectorAll('.btn-view-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const onclick = e.target.getAttribute('onclick');
            if (onclick) {
                const match = onclick.match(/'(\w+)'/);
                if (match) {
                    const viewType = match[1];
                    EPG.toggleView(viewType);
                }
            }
        });
    });

    // Set up time navigation
    const prevBtn = document.querySelector('.btn-time-prev');
    const nextBtn = document.querySelector('.btn-time-next');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => EPG.navigateTime(-1));
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => EPG.navigateTime(1));
    }

    // Set up export button
    const exportBtn = document.getElementById('export-epg-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => EPG.exportEPG());
    }

    // Set up player close button
    const closePlayerBtn = document.querySelector('.btn-close-player');
    if (closePlayerBtn) {
        closePlayerBtn.addEventListener('click', () => EPG.closePlayer());
    }
});

// Helper functions for HTML event handlers
function toggleChannel(channelId) {
    window.EPG.toggleChannel(channelId);
}

function playProgram(streamUrl, title) {
    window.EPG.playProgram(streamUrl, title);
}

function closePlayer() {
    window.EPG.closePlayer();
}

function toggleView(viewType) {
    window.EPG.toggleView(viewType);
}

function applyFilters() {
    window.EPG.applyFilters();
}

function navigateTime(direction) {
    window.EPG.navigateTime(direction);
}

function exportEPG() {
    window.EPG.exportEPG();
}

// Debounce utility (if not already defined globally)
function debounce(func, wait) {
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