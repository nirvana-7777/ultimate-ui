// EPG UI - With separate daily programs section
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

        // IMPROVED: Restructured layout
        const header = document.createElement('div');
        header.className = 'channel-header-compact';

        // Logo section (logo + name + play button)
        const logoSection = document.createElement('div');
        logoSection.className = 'channel-logo-section';

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

        logoSection.appendChild(logoContainer);

        // IMPROVED: Channel name now under logo with smaller font
        const name = document.createElement('div');
        name.className = 'channel-name-compact';
        name.textContent = channel.display_name;
        logoSection.appendChild(name);

        // Play button underneath name
        if (program && (program.stream_url || program.stream)) {
            const playBtn = document.createElement('button');
            playBtn.className = 'btn-play-tile';
            playBtn.innerHTML = '<span>▶</span> Play';
            playBtn.dataset.channelId = channel.id;
            playBtn.dataset.programId = program.id;
            logoSection.appendChild(playBtn);
        }

        header.appendChild(logoSection);

        // Event info - now takes main space
        const info = document.createElement('div');
        info.className = 'channel-info-compact';

        // Current program - title now on top with larger font
        if (program) {
            info.appendChild(this.createEventInfo(program));
        } else {
            const noProgram = document.createElement('div');
            noProgram.className = 'event-title text-muted';
            noProgram.textContent = 'Kein aktuelles Programm';
            info.appendChild(noProgram);
        }

        header.appendChild(info);

        // Preview image in top-right corner
        if (program) {
            const imageUrl = program.image_url || program.icon_url;
            if (imageUrl) {
                const previewImg = document.createElement('img');
                previewImg.className = 'event-preview-image';
                previewImg.src = imageUrl;
                previewImg.alt = program.title;
                previewImg.loading = 'lazy';
                previewImg.onerror = () => {
                    const fallback = document.createElement('div');
                    fallback.className = 'event-preview-fallback';
                    fallback.textContent = 'Kein Bild';
                    previewImg.replaceWith(fallback);
                };
                header.appendChild(previewImg);
            } else {
                const fallback = document.createElement('div');
                fallback.className = 'event-preview-fallback';
                fallback.textContent = 'Kein Bild';
                header.appendChild(fallback);
            }
        }

        div.appendChild(header);

        // IMPROVED: Progress bar with fixed positioning
        if (program && program.progress) {
            div.appendChild(this.createProgressBar(program));
        }

        // ADD: Expand button to show daily programs
        const expandBtn = document.createElement('button');
        expandBtn.className = 'expand-daily-btn';
        expandBtn.innerHTML = '▼ Tagesprogramm anzeigen';
        expandBtn.dataset.channelId = channel.id;
        div.appendChild(expandBtn);

        return div;
    }

    createEventInfo(program) {
        const container = document.createElement('div');
        container.className = 'current-event';

        // IMPROVED: Title now larger (was 16px, now 18px from CSS)
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

        // FIXED: Time is now above description
        const timeInfo = document.createElement('div');
        timeInfo.className = 'event-time';

        const timeRange = document.createElement('span');
        timeRange.textContent = `${program.start_time_local} - ${program.end_time_local}`;
        timeInfo.appendChild(timeRange);

        container.appendChild(timeInfo);

        // NEW: Description preview (2 lines max) with "weiterlesen" link
        if (program.description) {
            const description = document.createElement('div');
            description.className = 'event-description';
            description.textContent = program.description;
            container.appendChild(description);

            // Add "weiterlesen" link if description is long
            if (program.description.length > 100) {
                const expandLink = document.createElement('button');
                expandLink.className = 'expand-description-link';
                expandLink.textContent = 'weiterlesen';
                expandLink.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isExpanded = description.classList.contains('expanded');
                    description.classList.toggle('expanded');
                    expandLink.textContent = isExpanded ? 'weiterlesen' : 'weniger';
                });
                container.appendChild(expandLink);
            }
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

        // FIXED: Show only remaining time (centered)
        const timeRemaining = document.createElement('span');
        timeRemaining.className = 'time-remaining';
        timeRemaining.textContent = program.time_remaining;
        progressInfo.appendChild(timeRemaining);

        container.appendChild(progressBar);
        container.appendChild(progressInfo);

        return container;
    }

    // UPDATED: Show daily programs using data from manager
    showDailyPrograms(channel, programs) {
        const container = document.getElementById('daily-programs-container');
        const content = document.getElementById('daily-programs-content');

        if (!container || !content) return;

        // Clear previous content
        content.innerHTML = '';

        // Create channel header
        const channelCard = document.createElement('div');
        channelCard.className = 'channel-daily-expanded';

        const header = document.createElement('div');
        header.className = 'channel-daily-header-expanded';

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

        // Channel name
        const name = document.createElement('div');
        name.className = 'channel-daily-name';
        name.textContent = channel.display_name;
        header.appendChild(name);

        channelCard.appendChild(header);

        // Add all programs
        programs.forEach(program => {
            const programElement = this.createDailyProgramCardExpanded(channel, program);
            channelCard.appendChild(programElement);
        });

        content.appendChild(channelCard);

        // Show the section
        container.style.display = 'block';
        container.classList.add('active');

        // Scroll to the daily programs section
        setTimeout(() => {
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    // NEW: Create expanded program cards with more details
    createDailyProgramCardExpanded(channel, program) {
        const now = new Date();
        const startTime = new Date(program.start_time);
        const endTime = new Date(program.end_time);

        const div = document.createElement('div');
        div.className = 'daily-program-card-expanded';
        div.dataset.programId = program.id;
        div.dataset.channelId = channel.id;

        if (startTime <= now && endTime >= now) {
            div.classList.add('live');
        } else if (startTime > now) {
            div.classList.add('upcoming');
        }

        // Big image
        const imageContainer = document.createElement('div');
        if (program.image_url || program.icon_url) {
            const img = document.createElement('img');
            img.className = 'daily-program-image-expanded';
            img.src = program.image_url || program.icon_url;
            img.alt = program.title;
            img.loading = 'lazy';
            img.onerror = () => {
                const fallback = document.createElement('div');
                fallback.className = 'daily-program-image-fallback';
                fallback.textContent = 'Kein Bild';
                imageContainer.innerHTML = '';
                imageContainer.appendChild(fallback);
            };
            imageContainer.appendChild(img);
        } else {
            const fallback = document.createElement('div');
            fallback.className = 'daily-program-image-fallback';
            fallback.textContent = 'Kein Bild';
            imageContainer.appendChild(fallback);
        }
        div.appendChild(imageContainer);

        // Full details
        const details = document.createElement('div');
        details.className = 'daily-program-details-expanded';
        details.innerHTML = this.createDailyProgramDetailsExpandedHTML(program);
        div.appendChild(details);

        return div;
    }

    createDailyProgramDetailsExpandedHTML(program) {
        const now = new Date();
        const startTime = new Date(program.start_time);

        let timeBadge = '';
        if (startTime <= now) {
            timeBadge = '<span class="time-badge live">LIVE</span>';
        } else {
            timeBadge = '<span class="time-badge upcoming">DEMNÄCHST</span>';
        }

        // All available info
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
        if (program.episode_formatted) {
            metaItems.push(`<span class="program-episode">${program.episode_formatted}</span>`);
        }
        if (program.directors) {
            metaItems.push(`<span class="program-directors">Regie: ${this.escapeHtml(program.directors)}</span>`);
        }
        if (program.actors) {
            const actors = program.actors.length > 100 ?
                program.actors.substring(0, 100) + '...' : program.actors;
            metaItems.push(`<span class="program-actors">Darsteller: ${this.escapeHtml(actors)}</span>`);
        }

        const metaHTML = metaItems.length > 0 ?
            `<div class="daily-program-meta-expanded">${metaItems.join('')}</div>` : '';

        // FULL description (no truncation)
        const descriptionHTML = program.description ?
            `<div class="daily-program-description-expanded">${this.escapeHtml(program.description)}</div>` : '';

        // Play button if available
        const streamUrl = program.stream_url || program.stream;
        let playButton = '';
        if (streamUrl) {
            playButton = `<button class="btn-play" data-channel-id="${program.channel_id}" data-program-id="${program.id}">▶ Jetzt abspielen</button>`;
        }

        return `
            <div class="program-time">
                ${timeBadge}
                <span>${program.start_time_local} - ${program.end_time_local}</span>
            </div>
            <div class="daily-program-title-expanded">${this.escapeHtml(program.title)}</div>
            ${program.subtitle ? `<div class="program-subtitle">${this.escapeHtml(program.subtitle)}</div>` : ''}
            ${descriptionHTML}
            ${metaHTML}
            ${playButton}
        `;
    }

    // NEW: Close daily programs
    closeDailyPrograms() {
        const container = document.getElementById('daily-programs-container');
        if (container) {
            container.style.display = 'none';
            container.classList.remove('active');
        }
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
                const timeRemaining = card.querySelector('.time-remaining');

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

        // Play button now dispatches event with correct data structure
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

        if (program.episode_formatted) {
            detailItems.push(`
                <div class="detail-item">
                    <span class="detail-label">Episode</span>
                    <span class="detail-value">${program.episode_formatted}</span>
                </div>
            `);
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
                        ${program.episode_formatted ? `<span class="program-episode">${program.episode_formatted}</span>` : ''}
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