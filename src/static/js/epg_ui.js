// epg_ui.js - UI rendering and DOM manipulation - FIXED
class EPGUI {
    constructor(core) {
        this.core = core;
        this.expandedChannels = new Set();
        this.currentModal = null;
    }

    renderCurrentEvents(channels, currentEvents) {
        const container = document.getElementById('current-events-grid');
        if (!container) return;

        container.innerHTML = '';

        channels.forEach(channel => {
            const program = currentEvents.get(channel.id);
            const card = this.createCurrentEventCard(channel, program);
            container.appendChild(card);
        });

        if (channels.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Keine Kanäle verfügbar</p>
                    <p>Bitte überprüfen Sie die Konfiguration.</p>
                </div>
            `;
        }
    }

    createCurrentEventCard(channel, program) {
        const div = document.createElement('div');
        div.className = 'channel-now-card';
        div.dataset.channelId = channel.id;

        if (program) {
            div.classList.add(program.is_live ? 'live' : 'upcoming');
        }

        // Channel header with logo
        const header = document.createElement('div');
        header.className = 'channel-header-compact';

        // Logo
        const logoContainer = document.createElement('div');
        logoContainer.className = 'channel-logo-container';

        if (channel.icon_url) {
            const logo = document.createElement('img');
            logo.className = 'channel-logo';
            logo.src = channel.icon_url;
            logo.alt = channel.display_name;
            logo.onerror = () => {
                this.addLogoFallback(logoContainer, channel.display_name);
            };
            logoContainer.appendChild(logo);
        } else {
            this.addLogoFallback(logoContainer, channel.display_name);
        }

        header.appendChild(logoContainer);

        // Channel info
        const info = document.createElement('div');
        info.className = 'channel-info-compact';

        const name = document.createElement('div');
        name.className = 'channel-name-compact';
        name.textContent = channel.display_name;
        info.appendChild(name);

        // Current program
        if (program) {
            info.appendChild(this.createEventInfo(program));
        } else {
            const noProgram = document.createElement('div');
            noProgram.className = 'event-title text-muted';
            noProgram.textContent = 'Kein aktuelles Programm';
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

    createEventInfo(program) {
        const container = document.createElement('div');
        container.className = 'current-event';

        // Title
        const title = document.createElement('div');
        title.className = 'event-title';
        title.textContent = program.title;
        container.appendChild(title);

        // Subtitle
        if (program.subtitle) {
            const subtitle = document.createElement('div');
            subtitle.className = 'event-subtitle';
            subtitle.textContent = program.subtitle;
            container.appendChild(subtitle);
        }

        // Time
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

        container.appendChild(timeInfo);

        // Progress bar
        if (program.progress) {
            container.appendChild(this.createProgressBar(program));
        }

        return container;
    }

    createProgressBar(program) {
        const container = document.createElement('div');
        container.className = 'event-progress';

        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';

        const progressFill = document.createElement('div');
        progressFill.className = 'progress-fill';
        progressFill.style.width = `${program.progress.percentage}%`;
        progressBar.appendChild(progressFill);

        const progressInfo = document.createElement('div');
        progressInfo.className = 'progress-info';

        const timeRemaining = document.createElement('span');
        timeRemaining.className = 'time-remaining';
        timeRemaining.textContent = program.time_remaining;
        progressInfo.appendChild(timeRemaining);

        const duration = document.createElement('span');
        duration.textContent = `${program.progress.duration} min`;
        progressInfo.appendChild(duration);

        container.appendChild(progressBar);
        container.appendChild(progressInfo);

        return container;
    }

    renderDailyPrograms(channels, dailyPrograms) {
        const container = document.querySelector('.daily-programs');
        if (!container) return;

        // Clear existing programs
        const existingCards = container.querySelectorAll('.channel-daily-card');
        existingCards.forEach(card => card.remove());

        // Create program list header if needed
        if (!container.querySelector('.daily-programs-header')) {
            const header = document.createElement('div');
            header.className = 'daily-programs-header';
            header.innerHTML = `
                <h3>Tagesprogramm</h3>
                <small class="text-muted">Klicken Sie auf einen Sender, um das Programm anzuzeigen</small>
            `;
            container.prepend(header);
        }

        // Render each channel
        channels.forEach(channel => {
            const programs = dailyPrograms.get(channel.id) || [];
            if (programs.length > 0) {
                const channelCard = this.createChannelDailyCard(channel, programs);
                container.appendChild(channelCard);
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
                this.addLogoFallback(logoContainer, channel.display_name);
            };
            logoContainer.appendChild(logo);
        } else {
            this.addLogoFallback(logoContainer, channel.display_name);
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

        // Image
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

        // Details
        const details = document.createElement('div');
        details.className = 'program-details';
        details.innerHTML = this.createProgramDetailsHTML(program);
        div.appendChild(details);

        return div;
    }

    createProgramDetailsHTML(program) {
        const now = new Date();
        const startTime = new Date(program.start_time);

        let timeBadge = '';
        if (startTime <= now) {
            timeBadge = '<span class="time-badge live">LIVE</span>';
        } else {
            timeBadge = '<span class="time-badge upcoming">DEMNÄCHST</span>';
        }

        // Build meta info from all available fields
        const metaItems = [];

        if (program.category) {
            metaItems.push(`<span class="program-category">${this.escapeHtml(program.category)}</span>`);
        }

        if (program.duration) {
            metaItems.push(`<span class="program-duration">${program.duration} min</span>`);
        }

        if (program.rating) {
            metaItems.push(`<span class="program-rating">${this.escapeHtml(program.rating)}</span>`);
        }

        if (program.episode_num) {
            const epNum = program.episode_num.replace(/\./g, '').trim();
            if (epNum) {
                metaItems.push(`<span class="program-episode">Episode ${epNum}</span>`);
            }
        }

        const metaHTML = metaItems.length > 0 ?
            `<div class="program-meta">${metaItems.join('')}</div>` : '';

        // Description with expand/collapse
        let descriptionHTML = '';
        if (program.description) {
            descriptionHTML = `
                <div class="program-description">${this.escapeHtml(program.description)}</div>
                <button class="expand-description">Mehr anzeigen</button>
            `;
        }

        // Play button (check both stream and stream_url)
        const streamUrl = program.stream_url || program.stream;
        let playButton = '';
        if (streamUrl) {
            playButton = '<button class="btn-play">▶ Abspielen</button>';
        }

        return `
            <div class="program-time">
                ${timeBadge}
                <span>${program.start_time_local} - ${program.end_time_local}</span>
            </div>
            <div class="program-main-title">${this.escapeHtml(program.title)}</div>
            ${program.subtitle ? `<div class="program-subtitle">${this.escapeHtml(program.subtitle)}</div>` : ''}
            ${descriptionHTML}
            ${metaHTML}
            ${playButton}
        `;
    }

    createProgramDetailsModalHTML(program) {
        const imageUrl = program.icon_url || program.image_url || '';

        // Build details grid from all available fields
        const detailItems = [];

        detailItems.push(`
            <div class="detail-item">
                <span class="detail-label">Sendezeit</span>
                <span class="detail-value">${program.start_time_local} - ${program.end_time_local}</span>
            </div>
        `);

        if (program.date_local) {
            detailItems.push(`
                <div class="detail-item">
                    <span class="detail-label">Datum</span>
                    <span class="detail-value">${program.date_local}</span>
                </div>
            `);
        }

        if (program.category) {
            detailItems.push(`
                <div class="detail-item">
                    <span class="detail-label">Kategorie</span>
                    <span class="detail-value">${this.escapeHtml(program.category)}</span>
                </div>
            `);
        }

        if (program.rating) {
            detailItems.push(`
                <div class="detail-item">
                    <span class="detail-label">Altersfreigabe</span>
                    <span class="detail-value">${this.escapeHtml(program.rating)}</span>
                </div>
            `);
        }

        if (program.episode_num) {
            const epNum = program.episode_num.replace(/\./g, '').trim();
            if (epNum) {
                detailItems.push(`
                    <div class="detail-item">
                        <span class="detail-label">Episode</span>
                        <span class="detail-value">${epNum}</span>
                    </div>
                `);
            }
        }

        if (program.directors) {
            detailItems.push(`
                <div class="detail-item">
                    <span class="detail-label">Regie</span>
                    <span class="detail-value">${this.escapeHtml(program.directors)}</span>
                </div>
            `);
        }

        if (program.actors) {
            // Truncate long actor lists
            const actors = program.actors.length > 100 ?
                program.actors.substring(0, 100) + '...' :
                program.actors;
            detailItems.push(`
                <div class="detail-item">
                    <span class="detail-label">Besetzung</span>
                    <span class="detail-value">${this.escapeHtml(actors)}</span>
                </div>
            `);
        }

        const detailsGrid = detailItems.length > 0 ?
            `<div class="modal-program-details">${detailItems.join('')}</div>` : '';

        // Check for stream URL (both field names)
        const streamUrl = program.stream_url || program.stream;

        return `
            <div class="modal-program-header">
                ${imageUrl ? 
                    `<img src="${imageUrl}" alt="${this.escapeHtml(program.title)}" class="modal-program-image" 
                         onerror="this.onerror=null; this.style.display='none'; this.parentNode.innerHTML='<div class=\\'modal-program-image\\' style=\\'background: linear-gradient(135deg, var(--bg-tertiary), var(--border-color)); display: flex; align-items: center; justify-content: center; color: var(--text-muted);\\'>Kein Bild</div>';">` :
                    `<div class="modal-program-image" style="background: linear-gradient(135deg, var(--bg-tertiary), var(--border-color)); display: flex; align-items: center; justify-content: center; color: var(--text-muted);">Kein Bild</div>`
                }
                <div class="modal-program-info">
                    <h3 class="modal-program-title">${this.escapeHtml(program.title)}</h3>
                    ${program.subtitle ? `<div class="modal-program-subtitle">${this.escapeHtml(program.subtitle)}</div>` : ''}
                    
                    <div class="modal-program-meta">
                        ${program.category ? `<span class="program-category">${this.escapeHtml(program.category)}</span>` : ''}
                        ${program.duration ? `<span class="program-duration">${program.duration} min</span>` : ''}
                        ${program.rating ? `<span class="program-rating">${this.escapeHtml(program.rating)}</span>` : ''}
                        ${program.episode_num ? `<span class="program-episode">Episode ${program.episode_num.replace(/\./g, '').trim()}</span>` : ''}
                    </div>
                </div>
            </div>
            
            <div class="modal-program-description">
                ${program.description ? `<p>${this.escapeHtml(program.description)}</p>` : ''}
            </div>
            
            ${detailsGrid}
            
            <div class="modal-actions">
                ${streamUrl ? `
                <button class="btn-play" data-channel-id="${program.channel_id}" data-program-id="${program.id}">
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

    showProgramDetails(program) {
        // Close existing modal
        this.closeProgramDetails();

        const modal = document.getElementById('program-details-modal');
        const content = document.getElementById('modal-program-content');

        if (!modal || !content) return;

        content.innerHTML = this.createProgramDetailsModalHTML(program);
        modal.classList.add('active');
        this.currentModal = modal;

        // Add event listeners
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeProgramDetails());
        }

        // FIX: Play button now dispatches event with correct data structure
        const playBtn = content.querySelector('.btn-play');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                const channelId = playBtn.dataset.channelId;
                const programId = playBtn.dataset.programId;

                this.closeProgramDetails();

                document.dispatchEvent(new CustomEvent('play-program', {
                    detail: { channelId, programId }
                }));
            });
        }

        // Close modal on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeProgramDetails();
            }
        });
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

    toggleChannelExpansion(channelId) {
        const programsList = document.querySelector(`.channel-daily-card[data-channel-id="${channelId}"] .programs-list`);
        const toggleIcon = document.querySelector(`.channel-daily-card[data-channel-id="${channelId}"] .toggle-icon`);

        if (programsList && toggleIcon) {
            if (this.expandedChannels.has(channelId)) {
                programsList.style.display = 'none';
                toggleIcon.textContent = '▼';
                this.expandedChannels.delete(channelId);
            } else {
                programsList.style.display = 'block';
                toggleIcon.textContent = '▲';
                this.expandedChannels.add(channelId);

                // Scroll into view
                programsList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    // FIX: Update both progress bars AND percentage text
    updateProgressBars(core) {
        document.querySelectorAll('.channel-now-card').forEach(card => {
            const channelId = card.dataset.channelId;
            const program = core.currentEvents.get(channelId);

            if (program && program.progress) {
                const progressFill = card.querySelector('.progress-fill');
                const progressPercent = card.querySelector('.progress-percent');
                const timeRemaining = card.querySelector('.time-remaining');

                if (progressFill) {
                    const progress = core.calculateProgress(program.start_time, program.end_time);
                    if (progress) {
                        progressFill.style.width = `${progress.percentage}%`;

                        // Update percentage text
                        if (progressPercent) {
                            progressPercent.textContent = `${Math.round(progress.percentage)}%`;
                        }
                    }
                }

                if (timeRemaining) {
                    timeRemaining.textContent = core.calculateTimeRemaining(program.end_time);
                }
            }
        });
    }

    clearExpandedChannels() {
        this.expandedChannels.forEach(channelId => {
            const programsList = document.querySelector(`.channel-daily-card[data-channel-id="${channelId}"] .programs-list`);
            const toggleIcon = document.querySelector(`.channel-daily-card[data-channel-id="${channelId}"] .toggle-icon`);

            if (programsList && toggleIcon) {
                programsList.style.display = 'none';
                toggleIcon.textContent = '▼';
            }
        });
        this.expandedChannels.clear();
    }

    closeProgramDetails() {
        if (this.currentModal) {
            this.currentModal.classList.remove('active');
            this.currentModal = null;
        }
    }

    showLoading(show) {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.style.display = show ? 'flex' : 'none';
        }
    }

    showError(message) {
        const container = document.querySelector('.epg-container');
        if (container) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.innerHTML = `
                <p>⚠️ ${this.escapeHtml(message)}</p>
                <button onclick="location.reload()">Erneut versuchen</button>
            `;
            errorDiv.style.cssText = `
                text-align: center;
                padding: 40px 20px;
                background-color: var(--bg-card);
                border-radius: var(--radius);
                border: 1px solid var(--error-color);
                margin: 32px;
            `;
            container.appendChild(errorDiv);
        }

        if (window.showToast) {
            window.showToast(message, 'error');
        }
    }

    addLogoFallback(container, channelName) {
        container.innerHTML = '';
        const fallback = document.createElement('div');
        fallback.className = 'channel-logo-fallback';
        fallback.textContent = channelName.substring(0, 2).toUpperCase();
        container.appendChild(fallback);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}