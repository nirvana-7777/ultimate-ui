// epg_ui.js - Updated with smart time badges and fixed infinite scroll
class EPGUI {
    constructor(core) {
        this.core = core;
        this.expandedChannels = new Set();
        this.currentModal = null;
        this.dailyProgramsInfiniteScroll = null;
        this.currentLoadingChannel = null;
        this.isLoadingMorePrograms = false; // NEW: Track loading state
        this.addTimeBadgeCSS();
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

        const header = document.createElement('div');
        header.className = 'channel-header-compact';

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

        const name = document.createElement('div');
        name.className = 'channel-name-compact';
        name.textContent = channel.display_name;
        logoSection.appendChild(name);

        if (program && (program.stream_url || program.stream)) {
            const playBtn = document.createElement('button');
            playBtn.className = 'btn-play-tile';
            playBtn.innerHTML = '<span>▶</span> Play';
            playBtn.dataset.channelId = channel.id;
            playBtn.dataset.programId = program.id;
            logoSection.appendChild(playBtn);
        }

        header.appendChild(logoSection);

        const info = document.createElement('div');
        info.className = 'channel-info-compact';

        if (program) {
            info.appendChild(this.createEventInfo(program));
        } else {
            const noProgram = document.createElement('div');
            noProgram.className = 'event-title text-muted';
            noProgram.textContent = 'Kein aktuelles Programm';
            info.appendChild(noProgram);
        }

        header.appendChild(info);

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

        if (program && program.progress) {
            div.appendChild(this.createProgressBar(program));
        }

        const expandBtn = document.createElement('button');
        expandBtn.className = 'expand-daily-btn';
        expandBtn.innerHTML = '▼ Vorschau anzeigen';
        expandBtn.dataset.channelId = channel.id;
        div.appendChild(expandBtn);

        return div;
    }

    createEventInfo(program) {
        const container = document.createElement('div');
        container.className = 'current-event';

        const title = document.createElement('div');
        title.className = 'event-title';
        title.textContent = program.title;
        container.appendChild(title);

        if (program.subtitle) {
            const subtitle = document.createElement('div');
            subtitle.className = 'event-subtitle';
            subtitle.textContent = program.subtitle;
            container.appendChild(subtitle);
        }

        // UPDATED: Use smart time badge instead of simple time
        const timeInfo = document.createElement('div');
        timeInfo.className = 'event-time';

        if (program.time_badge) {
            // Create time badge element
            const timeBadge = document.createElement('span');
            timeBadge.className = program.time_badge.class;
            timeBadge.textContent = program.time_badge.text;

            // For live programs, show "LIVE" badge + time range
            if (program.time_badge.type === 'live') {
                const timeRange = document.createElement('span');
                timeRange.textContent = ` ${program.time_badge.timeRange}`;
                timeRange.style.color = 'var(--text-muted)';
                timeRange.style.marginLeft = '8px';
                timeInfo.appendChild(timeBadge);
                timeInfo.appendChild(timeRange);
            } else {
                // For non-live, just show the time badge
                timeInfo.appendChild(timeBadge);
            }
        } else {
            // Fallback to old format
            const timeRange = document.createElement('span');
            timeRange.textContent = `${program.start_time_local} - ${program.end_time_local}`;
            timeInfo.appendChild(timeRange);
        }

        container.appendChild(timeInfo);

        if (program.description) {
            const description = document.createElement('div');
            description.className = 'event-description';
            description.textContent = program.description;
            container.appendChild(description);

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

        container.appendChild(progressBar);

        const timeRemaining = document.createElement('div');
        timeRemaining.className = 'time-remaining-left';
        timeRemaining.textContent = program.time_remaining;
        container.appendChild(timeRemaining);

        return container;
    }

    showDailyPrograms(channel, programs) {
        const container = document.getElementById('daily-programs-container');
        const content = document.getElementById('daily-programs-content');
        const currentEventsGrid = document.getElementById('current-events-grid');

        if (!container || !content) return;

        this.currentLoadingChannel = channel.id;
        this.isLoadingMorePrograms = false; // Reset loading state

        if (currentEventsGrid) {
            currentEventsGrid.classList.add('hiding');
            setTimeout(() => {
                currentEventsGrid.style.display = 'none';
            }, 300);
        }

        content.innerHTML = '';

        const channelCard = document.createElement('div');
        channelCard.className = 'channel-daily-expanded';

        const header = document.createElement('div');
        header.className = 'channel-daily-header-expanded';

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

        const name = document.createElement('div');
        name.className = 'channel-daily-name';
        name.textContent = channel.display_name;
        header.appendChild(name);

        channelCard.appendChild(header);

        programs.forEach(program => {
            const programElement = this.createDailyProgramCardExpanded(channel, program);
            channelCard.appendChild(programElement);
        });

        content.appendChild(channelCard);

        // NEW: Add "Load more" button for multi-day support
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'load-more-programs-btn';
        loadMoreBtn.innerHTML = '▼ Mehr Programme laden';
        loadMoreBtn.dataset.channelId = channel.id; // Store channel ID
        loadMoreBtn.style.cssText = `
            display: block;
            width: 100%;
            padding: 16px;
            background-color: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            cursor: pointer;
            border-radius: 0 0 var(--radius) var(--radius);
            font-size: 14px;
            text-align: center;
            transition: all 0.2s;
            margin-top: 0;
        `;

        loadMoreBtn.addEventListener('mouseenter', () => {
            if (!loadMoreBtn.disabled) {
                loadMoreBtn.style.backgroundColor = 'var(--bg-card)';
            }
        });

        loadMoreBtn.addEventListener('mouseleave', () => {
            if (!loadMoreBtn.disabled) {
                loadMoreBtn.style.backgroundColor = 'var(--bg-tertiary)';
            }
        });

        loadMoreBtn.addEventListener('click', async () => {
            await this.loadMoreDailyPrograms(channel.id);
        });

        content.appendChild(loadMoreBtn);

        container.style.display = 'block';
        container.classList.add('active');

        // Setup infinite scroll observer AFTER button is in DOM
        setTimeout(() => {
            this.setupDailyProgramsInfiniteScroll(channel.id);
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    // NEW: Load more daily programs for a channel
    async loadMoreDailyPrograms(channelId) {
        // Prevent multiple simultaneous loads
        if (this.isLoadingMorePrograms) {
            console.log('Already loading more programs, skipping...');
            return;
        }

        const channel = this.core.getChannel(channelId);
        if (!channel || this.currentLoadingChannel !== channelId) {
            console.log('Channel not found or not current channel');
            return;
        }

        const content = document.getElementById('daily-programs-content');
        if (!content) return;

        // Find the channel card and get the last program
        const channelCard = content.querySelector('.channel-daily-expanded');
        if (!channelCard) return;

        const allProgramCards = channelCard.querySelectorAll('.daily-program-card-expanded');
        if (allProgramCards.length === 0) return;

        const lastProgramCard = allProgramCards[allProgramCards.length - 1];
        const lastProgramId = lastProgramCard.dataset.programId;
        const lastProgram = this.core.getProgram(channelId, lastProgramId);

        if (!lastProgram) {
            console.log('Could not find last program');
            return;
        }

        const loadMoreBtn = content.querySelector('.load-more-programs-btn');
        if (!loadMoreBtn) return;

        // Set loading state
        this.isLoadingMorePrograms = true;
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = 'Lädt mehr Programme...';
        loadMoreBtn.style.cursor = 'wait';
        loadMoreBtn.style.backgroundColor = 'var(--bg-tertiary)';

        try {
            console.log(`Loading next day after ${lastProgram.end_time}`);

            // Load next day's programs
            const newPrograms = await this.core.loadNextDayForChannel(
                channelId,
                lastProgram.end_time
            );

            console.log(`Loaded ${newPrograms.length} new programs`);

            if (newPrograms.length > 0) {
                // Insert new programs before the load more button
                newPrograms.forEach(program => {
                    const programElement = this.createDailyProgramCardExpanded(channel, program);
                    channelCard.appendChild(programElement);
                });

                // Re-enable button
                loadMoreBtn.disabled = false;
                loadMoreBtn.innerHTML = '▼ Mehr Programme laden';
                loadMoreBtn.style.cursor = 'pointer';
            } else {
                // No more programs available
                loadMoreBtn.disabled = true;
                loadMoreBtn.innerHTML = 'Keine weiteren Programme verfügbar';
                loadMoreBtn.style.cursor = 'default';
                loadMoreBtn.style.opacity = '0.6';

                // Disconnect observer since there's nothing more to load
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
            this.isLoadingMorePrograms = false;
        }
    }

    // NEW: Setup infinite scroll for daily programs
    setupDailyProgramsInfiniteScroll(channelId) {
        // Disconnect existing observer
        if (this.dailyProgramsInfiniteScroll) {
            this.dailyProgramsInfiniteScroll.disconnect();
            this.dailyProgramsInfiniteScroll = null;
        }

        // Wait for button to be in DOM
        const loadMoreBtn = document.querySelector('.load-more-programs-btn');
        if (!loadMoreBtn) {
            console.warn('Load more button not found for infinite scroll setup');
            return;
        }

        console.log('Setting up infinite scroll for channel', channelId);

        // Create new observer
        this.dailyProgramsInfiniteScroll = new IntersectionObserver(async (entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting &&
                    this.currentLoadingChannel === channelId &&
                    !this.isLoadingMorePrograms) {

                    const btn = entry.target;
                    if (btn.disabled && btn.innerHTML === 'Keine weiteren Programme verfügbar') {
                        console.log('No more programs to load, skipping');
                        return;
                    }

                    console.log('Infinite scroll triggered for daily programs');
                    await this.loadMoreDailyPrograms(channelId);
                }
            }
        }, {
            root: null,
            rootMargin: '500px', // Trigger earlier
            threshold: 0.1
        });

        // Observe the button
        this.dailyProgramsInfiniteScroll.observe(loadMoreBtn);
        console.log('Observing load more button for channel', channelId);
    }

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

        const details = document.createElement('div');
        details.className = 'daily-program-details-expanded';
        details.innerHTML = this.createDailyProgramDetailsExpandedHTML(program);
        div.appendChild(details);

        return div;
    }

    // UPDATED: Use smart time badges without LIVE/DEMNÄCHST text
    createDailyProgramDetailsExpandedHTML(program) {
        // Use the smart time badge
        let timeDisplay = '';
        if (program.time_badge) {
            timeDisplay = `
                <div class="program-time">
                    <span class="${program.time_badge.class}">${program.time_badge.text}</span>
                </div>
            `;
        } else {
            // Fallback
            const startTime = new Date(program.start_time);
            const now = new Date();
            let timeBadge = '';
            if (startTime <= now) {
                timeBadge = '<span class="time-badge live">LIVE</span>';
            } else {
                timeBadge = '<span class="time-badge today">' + program.start_time_local + '</span>';
            }
            timeDisplay = `
                <div class="program-time">
                    ${timeBadge}
                </div>
            `;
        }

        const metaItems = [];
        if (program.category) {
            metaItems.push(`<span class="program-category">${this.escapeHtml(program.category)}</span>`);
        }
        if (program.duration) {
            metaItems.push(`<span class="program-duration">${program.duration} min</span>`);
        }
        if (program.rating) {
            metaItems.push(this.createRatingBadge(program.rating));
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

        const descriptionHTML = program.description ?
            `<div class="daily-program-description-expanded">${this.escapeHtml(program.description)}</div>` : '';

        const streamUrl = program.stream_url || program.stream;
        let playButton = '';
        if (streamUrl) {
            playButton = `<button class="btn-play" data-channel-id="${program.channel_id}" data-program-id="${program.id}">▶ Jetzt abspielen</button>`;
        }

        return `
            ${timeDisplay}
            <div class="daily-program-title-expanded">${this.escapeHtml(program.title)}</div>
            ${program.subtitle ? `<div class="program-subtitle">${this.escapeHtml(program.subtitle)}</div>` : ''}
            ${descriptionHTML}
            ${metaHTML}
            ${playButton}
        `;
    }

    // Add CSS for yesterday badge
    addTimeBadgeCSS() {
        if (!document.querySelector('#time-badge-styles')) {
            const style = document.createElement('style');
            style.id = 'time-badge-styles';
            style.textContent = `
                .time-badge.yesterday {
                    background: linear-gradient(135deg, #8E8E93, #AEAEB2);
                    color: white;
                }
            `;
            document.head.appendChild(style);
        }
    }

    closeDailyPrograms() {
        const container = document.getElementById('daily-programs-container');
        const currentEventsGrid = document.getElementById('current-events-grid');

        if (this.dailyProgramsInfiniteScroll) {
            this.dailyProgramsInfiniteScroll.disconnect();
            this.dailyProgramsInfiniteScroll = null;
        }

        this.currentLoadingChannel = null;

        if (container) {
            container.classList.add('hiding');
            setTimeout(() => {
                container.style.display = 'none';
                container.classList.remove('active', 'hiding');
            }, 300);
        }

        if (currentEventsGrid) {
            currentEventsGrid.style.display = 'grid';
            void currentEventsGrid.offsetWidth;
            currentEventsGrid.classList.remove('hiding');
            currentEventsGrid.classList.add('showing');
            setTimeout(() => {
                currentEventsGrid.classList.remove('showing');
            }, 300);
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

    showProgramDetails(program) {
        this.closeProgramDetails();

        const modal = document.getElementById('program-details-modal');
        const content = document.getElementById('modal-program-content');

        if (!modal || !content) return;

        content.innerHTML = this.createProgramDetailsModalHTML(program);
        modal.classList.add('active');
        this.currentModal = modal;

        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeProgramDetails());
        }

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

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeProgramDetails();
            }
        });
    }

    createProgramDetailsModalHTML(program) {
        const imageUrl = program.icon_url || program.image_url || '';

        // Use smart time badge in modal
        let timeDisplay = '';
        if (program.time_badge) {
            timeDisplay = `
                <div class="detail-item">
                    <span class="detail-label">Sendezeit</span>
                    <span class="detail-value ${program.time_badge.class}">${program.time_badge.text}</span>
                </div>
            `;
        } else {
            timeDisplay = `
                <div class="detail-item">
                    <span class="detail-label">Sendezeit</span>
                    <span class="detail-value">${program.start_time_local} - ${program.end_time_local}</span>
                </div>
            `;
        }

        const detailItems = [timeDisplay];

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
                    <span class="detail-value">${this.createRatingBadge(program.rating)}</span>
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
                        ${program.rating ? this.createRatingBadge(program.rating) : ''}
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

    createRatingBadge(rating) {
        if (!rating) return '';

        const ageMatch = rating.toString().match(/(\d+)/);
        if (!ageMatch) {
            return `<span class="program-rating">${this.escapeHtml(rating)}</span>`;
        }

        const age = parseInt(ageMatch[1], 10);

        let fskClass = 'fsk-0';
        if (age >= 18) fskClass = 'fsk-18';
        else if (age >= 16) fskClass = 'fsk-16';
        else if (age >= 12) fskClass = 'fsk-12';
        else if (age >= 6) fskClass = 'fsk-6';

        return `<span class="fsk-badge ${fskClass}">FSK ${age}</span>`;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}