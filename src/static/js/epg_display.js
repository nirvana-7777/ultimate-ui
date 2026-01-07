/**
 * Enhanced EPG Display Manager
 * Features:
 * - Local timezone display
 * - Current events grid with progress indicators
 * - Daily programs with expandable details
 * - Floating video player
 * - Event images support
 * - Sticky date navigation
 */

class EPGDisplayManager {
    constructor() {
        // Configuration
        this.config = {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            dateFormat: 'de-DE',
            refreshInterval: 300,
            itemsPerPage: 50
        };

        // State
        this.currentDate = new Date();
        this.channels = [];
        this.currentEvents = new Map();
        this.dailyPrograms = new Map();
        this.expandedChannels = new Set();
        this.isLoading = false;

        // Player
        this.floatingPlayer = null;
        this.playerInstance = null;
        this.currentStream = null;

        // Initialize
        this.initialize();
    }

    async initialize() {
        // Set timezone from config or browser
        const timezone = document.getElementById('template-data')?.dataset.timezone;
        if (timezone) {
            this.config.timezone = timezone;
        }

        // Setup event listeners
        this.setupEventListeners();
        this.setupDateNavigation();
        this.setupPlayer();

        // Load initial data
        await this.loadData();

        // Start auto-refresh
        this.startAutoRefresh();

        // Update time displays every minute
        setInterval(() => this.updateTimeDisplays(), 60000);
    }

    setupEventListeners() {
        // Date navigation
        document.getElementById('date-prev-btn')?.addEventListener('click', () => this.navigateDate(-1));
        document.getElementById('date-next-btn')?.addEventListener('click', () => this.navigateDate(1));
        document.getElementById('date-today-btn')?.addEventListener('click', () => this.goToToday());

        // Expand/collapse channel programs
        document.addEventListener('click', (e) => {
            if (e.target.closest('.expand-toggle')) {
                const channelId = e.target.closest('.channel-now-card')?.dataset.channelId;
                if (channelId) {
                    this.toggleChannelExpansion(channelId);
                }
            }

            if (e.target.closest('.channel-daily-header')) {
                const channelId = e.target.closest('.channel-daily-card')?.dataset.channelId;
                if (channelId) {
                    this.toggleDailyPrograms(channelId);
                }
            }

            // Play program
            if (e.target.closest('.btn-play')) {
                const programElement = e.target.closest('[data-program-id]');
                if (programElement) {
                    const programId = programElement.dataset.programId;
                    const channelId = programElement.dataset.channelId;
                    this.playProgram(channelId, programId);
                }
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
            }

            // Open program details
            if (e.target.closest('.program-card') && !e.target.closest('.btn-play')) {
                const programElement = e.target.closest('.program-card');
                const programId = programElement.dataset.programId;
                const channelId = programElement.dataset.channelId;
                this.showProgramDetails(channelId, programId);
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeProgramDetails();
                this.closePlayer();
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
        });

        // Close modal on backdrop click
        document.getElementById('program-details-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'program-details-modal') {
                this.closeProgramDetails();
            }
        });
    }

    setupDateNavigation() {
        this.updateDateDisplay();

        // Make date navigation sticky
        const dateNav = document.querySelector('.date-navigation');
        if (dateNav) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 64) {
                    dateNav.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
                } else {
                    dateNav.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                }
            });
        }
    }

    setupPlayer() {
        // Initialize floating player
        this.floatingPlayer = document.getElementById('floating-player');
        const videoElement = document.getElementById('floating-video');

        if (!videoElement) return;

        // Close player buttons
        document.getElementById('player-minimize')?.addEventListener('click', () => {
            this.floatingPlayer?.classList.remove('active');
        });

        document.getElementById('player-close')?.addEventListener('click', () => {
            this.closePlayer();
        });
    }

    async loadData() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading(true);

        try {
            const [channelsData, programsData] = await Promise.all([
                this.fetchChannels(),
                this.fetchProgramsForDate(this.currentDate)
            ]);

            this.channels = channelsData;
            this.processProgramData(programsData);
            this.renderCurrentEvents();
            this.renderDailyPrograms();

        } catch (error) {
            console.error('Error loading EPG data:', error);
            this.showError('Fehler beim Laden der EPG-Daten. Bitte versuchen Sie es später erneut.');
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    }

    async fetchChannels() {
        try {
            const response = await fetch('/api/epg/channels');
            const data = await response.json();
            return data.channels || [];
        } catch (error) {
            console.error('Error fetching channels:', error);
            return [];
        }
    }

    async fetchProgramsForDate(date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        try {
            const response = await fetch(`/api/epg/programs?start=${startDate.toISOString()}&end=${endDate.toISOString()}`);
            const data = await response.json();
            return data.programs || [];
        } catch (error) {
            console.error('Error fetching programs:', error);
            return [];
        }
    }

    processProgramData(programs) {
        // Clear existing data
        this.currentEvents.clear();
        this.dailyPrograms.clear();

        const now = new Date();

        programs.forEach(program => {
            // Convert times to local timezone
            program.start_time_local = this.formatDateTime(program.start_time, 'time');
            program.end_time_local = this.formatDateTime(program.end_time, 'time');
            program.date_local = this.formatDateTime(program.start_time, 'date');

            // Calculate progress for current events
            if (program.start_time <= now && program.end_time >= now) {
                program.progress = this.calculateProgress(program.start_time, program.end_time);
                program.time_remaining = this.calculateTimeRemaining(program.end_time);
                this.currentEvents.set(program.channel_id, program);
            }

            // Group programs by channel for daily view
            if (!this.dailyPrograms.has(program.channel_id)) {
                this.dailyPrograms.set(program.channel_id, []);
            }
            this.dailyPrograms.get(program.channel_id).push(program);
        });

        // Sort programs by time within each channel
        this.dailyPrograms.forEach(programs => {
            programs.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        });
    }

    renderCurrentEvents() {
        const container = document.getElementById('current-events-grid');
        if (!container) return;

        container.innerHTML = '';

        this.channels.forEach(channel => {
            const currentProgram = this.currentEvents.get(channel.id);
            const channelElement = this.createCurrentEventCard(channel, currentProgram);
            container.appendChild(channelElement);
        });
    }

    createCurrentEventCard(channel, program) {
        const div = document.createElement('div');
        div.className = 'channel-now-card';
        div.dataset.channelId = channel.id;

        if (program) {
            div.classList.add(program.start_time <= new Date() && program.end_time >= new Date() ? 'live' : 'upcoming');
        }

        // Channel header
        const header = document.createElement('div');
        header.className = 'channel-header-compact';

        // Logo with fallback
        const logoContainer = document.createElement('div');
        logoContainer.className = 'channel-logo-container';

        if (channel.icon_url) {
            const logo = document.createElement('img');
            logo.className = 'channel-logo';
            logo.src = channel.icon_url;
            logo.alt = channel.display_name;
            logo.onerror = () => {
                logo.remove();
                const fallback = document.createElement('div');
                fallback.className = 'channel-logo-fallback';
                fallback.textContent = channel.display_name.substring(0, 2).toUpperCase();
                logoContainer.appendChild(fallback);
            };
            logoContainer.appendChild(logo);
        } else {
            const fallback = document.createElement('div');
            fallback.className = 'channel-logo-fallback';
            fallback.textContent = channel.display_name.substring(0, 2).toUpperCase();
            logoContainer.appendChild(fallback);
        }

        header.appendChild(logoContainer);

        // Channel info
        const info = document.createElement('div');
        info.className = 'channel-info-compact';

        const name = document.createElement('div');
        name.className = 'channel-name-compact';
        name.textContent = channel.display_name;
        info.appendChild(name);

        // Current event info
        if (program) {
            const eventInfo = document.createElement('div');
            eventInfo.className = 'current-event';

            const title = document.createElement('div');
            title.className = 'event-title';
            title.textContent = program.title;
            eventInfo.appendChild(title);

            if (program.subtitle) {
                const subtitle = document.createElement('div');
                subtitle.className = 'event-subtitle';
                subtitle.textContent = program.subtitle;
                eventInfo.appendChild(subtitle);
            }

            // Time and progress
            const timeInfo = document.createElement('div');
            timeInfo.className = 'event-time';

            const timeRange = document.createElement('span');
            timeRange.textContent = `${program.start_time_local} - ${program.end_time_local}`;
            timeInfo.appendChild(timeRange);

            if (program.progress) {
                const progressText = document.createElement('span');
                progressText.className = 'progress-percent';
                progressText.textContent = `${Math.round(program.progress.percentage)}%`;
                timeInfo.appendChild(progressText);
            }

            eventInfo.appendChild(timeInfo);

            // Progress bar
            if (program.progress) {
                const progress = document.createElement('div');
                progress.className = 'event-progress';

                const progressBar = document.createElement('div');
                progressBar.className = 'progress-bar';

                const progressFill = document.createElement('div');
                progressFill.className = 'progress-fill';
                progressFill.style.width = `${program.progress.percentage}%`;
                progressBar.appendChild(progressFill);
                progress.appendChild(progressBar);

                const progressInfo = document.createElement('div');
                progressInfo.className = 'progress-info';

                const timeRemaining = document.createElement('span');
                timeRemaining.className = 'time-remaining';
                timeRemaining.textContent = program.time_remaining;
                progressInfo.appendChild(timeRemaining);

                const duration = document.createElement('span');
                duration.textContent = program.progress.duration;
                progressInfo.appendChild(duration);

                progress.appendChild(progressInfo);
                eventInfo.appendChild(progress);
            }

            info.appendChild(eventInfo);
        } else {
            const noProgram = document.createElement('div');
            noProgram.className = 'event-title text-muted';
            noProgram.textContent = 'Kein Programm verfügbar';
            info.appendChild(noProgram);
        }

        header.appendChild(info);
        div.appendChild(header);

        // Expand button
        const expandBtn = document.createElement('button');
        expandBtn.className = 'expand-toggle';
        expandBtn.innerHTML = '▼';
        expandBtn.title = 'Tagesprogramm anzeigen';
        div.appendChild(expandBtn);

        return div;
    }

    renderDailyPrograms() {
        const container = document.querySelector('.daily-programs');
        if (!container) return;

        // Clear existing programs except header
        const existingCards = container.querySelectorAll('.channel-daily-card');
        existingCards.forEach(card => card.remove());

        this.channels.forEach(channel => {
            const programs = this.dailyPrograms.get(channel.id) || [];
            if (programs.length > 0) {
                const channelElement = this.createChannelDailyCard(channel, programs);
                container.appendChild(channelElement);
            }
        });
    }

    createChannelDailyCard(channel, programs) {
        const div = document.createElement('div');
        div.className = 'channel-daily-card';
        div.dataset.channelId = channel.id;

        // Header
        const header = document.createElement('div');
        header.className = 'channel-daily-header';

        const logoContainer = document.createElement('div');
        logoContainer.className = 'channel-logo-container';
        logoContainer.style.width = '40px';
        logoContainer.style.height = '40px';

        if (channel.icon_url) {
            const logo = document.createElement('img');
            logo.className = 'channel-logo';
            logo.src = channel.icon_url;
            logo.alt = channel.display_name;
            logo.onerror = () => {
                logo.remove();
                const fallback = document.createElement('div');
                fallback.className = 'channel-logo-fallback';
                fallback.textContent = channel.display_name.substring(0, 2).toUpperCase();
                logoContainer.appendChild(fallback);
            };
            logoContainer.appendChild(logo);
        } else {
            const fallback = document.createElement('div');
            fallback.className = 'channel-logo-fallback';
            fallback.textContent = channel.display_name.substring(0, 2).toUpperCase();
            logoContainer.appendChild(fallback);
        }

        header.appendChild(logoContainer);

        const name = document.createElement('div');
        name.className = 'channel-name-compact';
        name.textContent = channel.display_name;
        header.appendChild(name);

        const toggle = document.createElement('div');
        toggle.className = 'toggle-icon';
        toggle.innerHTML = this.expandedChannels.has(channel.id) ? '▲' : '▼';
        header.appendChild(toggle);

        div.appendChild(header);

        // Programs list
        const programsList = document.createElement('div');
        programsList.className = 'programs-list';
        programsList.style.display = this.expandedChannels.has(channel.id) ? 'block' : 'none';

        programs.forEach(program => {
            const programElement = this.createProgramCard(channel, program);
            programsList.appendChild(programElement);
        });

        div.appendChild(programsList);

        return div;
    }

    createProgramCard(channel, program) {
        const now = new Date();
        const startTime = new Date(program.start_time);
        const endTime = new Date(program.end_time);

        const div = document.createElement('div');
        div.className = 'program-card';
        div.dataset.programId = program.id;
        div.dataset.channelId = channel.id;

        if (startTime <= now && endTime >= now) {
            div.classList.add('live');
        } else if (startTime > now) {
            div.classList.add('upcoming');
        }

        // Program image
        const imageContainer = document.createElement('div');
        if (program.image_url) {
            const img = document.createElement('img');
            img.className = 'program-image';
            img.src = program.image_url;
            img.alt = program.title;
            img.loading = 'lazy';
            imageContainer.appendChild(img);
        } else {
            const fallback = document.createElement('div');
            fallback.className = 'program-image-fallback';
            fallback.textContent = 'Kein Bild';
            imageContainer.appendChild(fallback);
        }
        div.appendChild(imageContainer);

        // Program details
        const details = document.createElement('div');
        details.className = 'program-details';

        // Time badge
        const timeInfo = document.createElement('div');
        timeInfo.className = 'program-time';

        const timeBadge = document.createElement('span');
        timeBadge.className = 'time-badge';
        if (startTime <= now && endTime >= now) {
            timeBadge.classList.add('live');
            timeBadge.textContent = 'LIVE';
        } else if (startTime > now) {
            timeBadge.classList.add('upcoming');
            timeBadge.textContent = 'DEMNÄCHST';
        }
        timeInfo.appendChild(timeBadge);

        const timeText = document.createElement('span');
        timeText.textContent = `${program.start_time_local} - ${program.end_time_local}`;
        timeInfo.appendChild(timeText);
        details.appendChild(timeInfo);

        // Title
        const title = document.createElement('div');
        title.className = 'program-main-title';
        title.textContent = program.title;
        details.appendChild(title);

        // Subtitle
        if (program.subtitle) {
            const subtitle = document.createElement('div');
            subtitle.className = 'program-subtitle';
            subtitle.textContent = program.subtitle;
            details.appendChild(subtitle);
        }

        // Description with expand/collapse
        if (program.description) {
            const description = document.createElement('div');
            description.className = 'program-description';
            description.textContent = program.description;
            details.appendChild(description);

            const expandBtn = document.createElement('button');
            expandBtn.className = 'expand-description';
            expandBtn.textContent = 'Mehr anzeigen';
            details.appendChild(expandBtn);
        }

        // Metadata
        const meta = document.createElement('div');
        meta.className = 'program-meta';

        if (program.category) {
            const category = document.createElement('span');
            category.className = 'program-category';
            category.textContent = program.category;
            meta.appendChild(category);
        }

        if (program.duration) {
            const duration = document.createElement('span');
            duration.className = 'program-duration';
            duration.textContent = `${program.duration} min`;
            meta.appendChild(duration);
        }

        if (program.rating) {
            const rating = document.createElement('span');
            rating.className = 'program-rating';
            rating.textContent = program.rating;
            meta.appendChild(rating);
        }

        details.appendChild(meta);

        // Play button
        if (program.stream_url) {
            const playBtn = document.createElement('button');
            playBtn.className = 'btn-play';
            playBtn.innerHTML = '▶ Abspielen';
            details.appendChild(playBtn);
        }

        div.appendChild(details);

        return div;
    }

    async showProgramDetails(channelId, programId) {
        const program = this.dailyPrograms.get(channelId)?.find(p => p.id === programId);
        if (!program) return;

        const modal = document.getElementById('program-details-modal');
        const content = document.getElementById('modal-program-content');

        if (!modal || !content) return;

        // Populate modal content
        content.innerHTML = this.createProgramDetailsHTML(program);
        modal.classList.add('active');

        // Add event listeners for modal actions
        const playBtn = content.querySelector('.btn-play');
        if (playBtn && program.stream_url) {
            playBtn.addEventListener('click', () => {
                this.playProgram(channelId, programId);
                this.closeProgramDetails();
            });
        }
    }

    createProgramDetailsHTML(program) {
        return `
            <div class="modal-program-header">
                ${program.image_url ? 
                    `<img src="${program.image_url}" alt="${program.title}" class="modal-program-image">` :
                    `<div class="modal-program-image" style="background: linear-gradient(135deg, var(--bg-tertiary), var(--border-color)); display: flex; align-items: center; justify-content: center; color: var(--text-muted);">Kein Bild</div>`
                }
                <div class="modal-program-info">
                    <h3 class="modal-program-title">${this.escapeHtml(program.title)}</h3>
                    ${program.subtitle ? `<div class="modal-program-subtitle">${this.escapeHtml(program.subtitle)}</div>` : ''}
                    
                    <div class="modal-program-meta">
                        ${program.category ? `<span class="program-category">${this.escapeHtml(program.category)}</span>` : ''}
                        ${program.duration ? `<span class="program-duration">${program.duration} min</span>` : ''}
                        ${program.rating ? `<span class="program-rating">${program.rating}</span>` : ''}
                    </div>
                </div>
            </div>
            
            <div class="modal-program-description">
                ${program.description ? `<p>${this.escapeHtml(program.description)}</p>` : ''}
            </div>
            
            <div class="modal-program-details">
                <div class="detail-item">
                    <span class="detail-label">Sendezeit</span>
                    <span class="detail-value">${program.start_time_local} - ${program.end_time_local}</span>
                </div>
                ${program.date_local ? `
                <div class="detail-item">
                    <span class="detail-label">Datum</span>
                    <span class="detail-value">${program.date_local}</span>
                </div>` : ''}
                ${program.genre ? `
                <div class="detail-item">
                    <span class="detail-label">Genre</span>
                    <span class="detail-value">${this.escapeHtml(program.genre)}</span>
                </div>` : ''}
                ${program.production_year ? `
                <div class="detail-item">
                    <span class="detail-label">Produktionsjahr</span>
                    <span class="detail-value">${program.production_year}</span>
                </div>` : ''}
                ${program.country ? `
                <div class="detail-item">
                    <span class="detail-label">Land</span>
                    <span class="detail-value">${this.escapeHtml(program.country)}</span>
                </div>` : ''}
                ${program.director ? `
                <div class="detail-item">
                    <span class="detail-label">Regie</span>
                    <span class="detail-value">${this.escapeHtml(program.director)}</span>
                </div>` : ''}
                ${program.cast ? `
                <div class="detail-item">
                    <span class="detail-label">Besetzung</span>
                    <span class="detail-value">${this.escapeHtml(program.cast)}</span>
                </div>` : ''}
            </div>
            
            <div class="modal-actions">
                ${program.stream_url ? `
                <button class="btn-play">
                    <span>▶</span>
                    Jetzt abspielen
                </button>` : ''}
                <button class="btn-reminder">
                    <span>⏰</span>
                    Erinnerung setzen
                </button>
            </div>
        `;
    }

    async playProgram(channelId, programId) {
        const program = this.dailyPrograms.get(channelId)?.find(p => p.id === programId);
        if (!program?.stream_url) {
            this.showToast('Kein Stream für dieses Programm verfügbar', 'warning');
            return;
        }

        this.currentStream = program.stream_url;

        // Show floating player
        const player = document.getElementById('floating-player');
        const video = document.getElementById('floating-video');
        const titleElement = document.getElementById('player-title');
        const subtitleElement = document.getElementById('player-subtitle');

        if (player && video && titleElement) {
            // Update player info
            titleElement.textContent = program.title;
            if (subtitleElement && program.subtitle) {
                subtitleElement.textContent = program.subtitle;
            }

            // Initialize Shaka Player if needed
            if (program.stream_url.includes('.mpd') || program.stream_url.includes('.m3u8')) {
                await this.initializeShakaPlayer(video, program.stream_url);
            } else {
                video.src = program.stream_url;
                video.load();
                video.play().catch(e => {
                    console.warn('Autoplay blocked:', e);
                    this.showToast('Klicken Sie auf Play, um den Stream zu starten', 'info');
                });
            }

            player.classList.add('active');
        }
    }

    async initializeShakaPlayer(videoElement, streamUrl) {
        if (!window.shaka) {
            this.showToast('Shaka Player nicht verfügbar', 'error');
            return;
        }

        try {
            if (!this.playerInstance) {
                this.playerInstance = new shaka.Player(videoElement);
                this.playerInstance.configure({
                    streaming: {
                        bufferingGoal: 30,
                        rebufferingGoal: 2
                    }
                });
            }

            await this.playerInstance.load(streamUrl);
            videoElement.play().catch(e => {
                console.warn('Autoplay blocked:', e);
                this.showToast('Klicken Sie auf Play, um den Stream zu starten', 'info');
            });
        } catch (error) {
            console.error('Error loading stream with Shaka:', error);
            this.showToast(`Fehler beim Laden: ${error.message}`, 'error');
        }
    }

    closePlayer() {
        const player = document.getElementById('floating-player');
        const video = document.getElementById('floating-video');

        if (player) {
            player.classList.remove('active');
        }

        if (video) {
            video.pause();
            video.src = '';
        }

        if (this.playerInstance) {
            this.playerInstance.unload();
        }

        this.currentStream = null;
    }

    closeProgramDetails() {
        const modal = document.getElementById('program-details-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    // Utility methods
    formatDateTime(dateTime, format = 'datetime') {
        const date = new Date(dateTime);
        const options = {
            timeZone: this.config.timezone
        };

        switch (format) {
            case 'date':
                Object.assign(options, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                break;
            case 'time':
                Object.assign(options, {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                break;
            default:
                Object.assign(options, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
        }

        return date.toLocaleDateString(this.config.dateFormat, options);
    }

    calculateProgress(startTime, endTime) {
        const now = new Date();
        const start = new Date(startTime);
        const end = new Date(endTime);

        if (now < start || now > end) return null;

        const total = end - start;
        const elapsed = now - start;
        const percentage = (elapsed / total) * 100;

        // Format duration
        const duration = Math.round((end - start) / 60000); // in minutes

        return {
            percentage,
            duration: `${duration} min`,
            elapsed: Math.round(elapsed / 60000),
            remaining: Math.round((end - now) / 60000)
        };
    }

    calculateTimeRemaining(endTime) {
        const now = new Date();
        const end = new Date(endTime);
        const diff = end - now;

        if (diff <= 0) return 'Beendet';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `Noch ${hours}h ${minutes}m`;
        } else {
            return `Noch ${minutes}m`;
        }
    }

    navigateDate(days) {
        this.currentDate.setDate(this.currentDate.getDate() + days);
        this.updateDateDisplay();
        this.loadData();
        this.expandedChannels.clear();
    }

    goToToday() {
        this.currentDate = new Date();
        this.updateDateDisplay();
        this.loadData();
        this.expandedChannels.clear();
    }

    updateDateDisplay() {
        const displayElement = document.getElementById('date-display');
        const todayBtn = document.getElementById('date-today-btn');

        if (displayElement) {
            displayElement.textContent = this.formatDateTime(this.currentDate, 'date');
        }

        // Update today button state
        if (todayBtn) {
            const today = new Date();
            const isToday = this.currentDate.toDateString() === today.toDateString();
            todayBtn.classList.toggle('active', isToday);
        }
    }

    updateTimeDisplays() {
        // Update current time in sidebar
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = this.formatDateTime(now, 'datetime');
        }

        // Update progress bars
        document.querySelectorAll('.progress-fill').forEach(progressFill => {
            const card = progressFill.closest('.channel-now-card');
            const channelId = card?.dataset.channelId;
            if (channelId) {
                const program = this.currentEvents.get(channelId);
                if (program) {
                    const progress = this.calculateProgress(program.start_time, program.end_time);
                    if (progress) {
                        progressFill.style.width = `${progress.percentage}%`;

                        // Update time remaining
                        const timeRemaining = card.querySelector('.time-remaining');
                        if (timeRemaining) {
                            timeRemaining.textContent = this.calculateTimeRemaining(program.end_time);
                        }
                    }
                }
            }
        });
    }

    toggleChannelExpansion(channelId) {
        const card = document.querySelector(`.channel-now-card[data-channel-id="${channelId}"]`);
        const programsList = document.querySelector(`.channel-daily-card[data-channel-id="${channelId}"] .programs-list`);

        if (card && programsList) {
            // Scroll to the daily programs for this channel
            programsList.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Expand if not already expanded
            if (!this.expandedChannels.has(channelId)) {
                this.expandedChannels.add(channelId);
                programsList.style.display = 'block';
                programsList.closest('.channel-daily-card').querySelector('.toggle-icon').textContent = '▲';
            }
        }
    }

    toggleDailyPrograms(channelId) {
        const programsList = document.querySelector(`.channel-daily-card[data-channel-id="${channelId}"] .programs-list`);
        const toggleIcon = document.querySelector(`.channel-daily-card[data-channel-id="${channelId}"] .toggle-icon`);

        if (programsList && toggleIcon) {
            if (programsList.style.display === 'none') {
                programsList.style.display = 'block';
                toggleIcon.textContent = '▲';
                this.expandedChannels.add(channelId);
            } else {
                programsList.style.display = 'none';
                toggleIcon.textContent = '▼';
                this.expandedChannels.delete(channelId);
            }
        }
    }

    startAutoRefresh() {
        setInterval(() => {
            if (!this.isLoading) {
                this.loadData();
            }
        }, this.config.refreshInterval * 1000);
    }

    showLoading(show) {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.style.display = show ? 'flex' : 'none';
        }
    }

    showError(message) {
        const container = document.querySelector('.epg-content');
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    <p>⚠️ ${this.escapeHtml(message)}</p>
                    <button onclick="location.reload()">Erneut versuchen</button>
                </div>
            `;
        }
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info', duration = 3000) {
        if (window.showToast) {
            window.showToast(message, type, duration);
        } else {
            console.log(`${type}: ${message}`);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.epgManager = new EPGDisplayManager();
});