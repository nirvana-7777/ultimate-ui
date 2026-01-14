// ui/EPGRenderer.js - DOM creation and rendering
class EPGRenderer {
    constructor(epgUI) {
        this.epgUI = epgUI;
        this.core = epgUI.core;
    }

    renderCurrentEvents(channels, currentEvents) {
        const container = document.getElementById('current-events-grid');
        if (!container) return;

        container.innerHTML = '';

        channels.forEach(channel => {
            const channelId = channel.Id || channel.id;
            const program = currentEvents.get(channelId);
            const card = this.createCurrentEventCard(channel, program);
            container.appendChild(card);
        });

        if (channels.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Keine Kanäle verfügbar</p>
                    ${this.core.activeProvider ? 
                        '<p>Dieser Provider hat keine Kanäle oder es wurden keine EPG-Daten gefunden.</p>' :
                        '<p>Bitte überprüfen Sie die Konfiguration.</p>'
                    }
                </div>
            `;
        }
    }

    createCurrentEventCard(channel, program) {
        const div = document.createElement('div');
        div.className = 'channel-now-card';

        const channelId = channel.Id || channel.id;
        div.dataset.channelId = channelId;

        if (program) {
            div.classList.add(program.is_live ? 'live' : 'upcoming');
        }

        const header = document.createElement('div');
        header.className = 'channel-header-compact';

        const logoSection = document.createElement('div');
        logoSection.className = 'channel-logo-section';

        const logoContainer = document.createElement('div');
        logoContainer.className = 'channel-logo-container';

        const logoUrl = channel.LogoUrl || channel.icon_url;
        if (logoUrl) {
            const logo = document.createElement('img');
            logo.className = 'channel-logo';
            logo.src = logoUrl;
            logo.alt = channel.Name || channel.display_name;
            logo.onerror = () => {
                this.epgUI.components.utilities.addLogoFallback(logoContainer, channel.Name || channel.display_name);
            };
            logoContainer.appendChild(logo);
        } else {
            this.epgUI.components.utilities.addLogoFallback(logoContainer, channel.Name || channel.display_name);
        }

        logoSection.appendChild(logoContainer);

        const name = document.createElement('div');
        name.className = 'channel-name-compact';
        name.textContent = channel.Name || channel.display_name;
        logoSection.appendChild(name);

        // Add play button for provider channels OR if program has stream
        const isProviderChannel = this.core.activeProvider && channel.StreamUrl;
        const hasStream = isProviderChannel || (program && (program.stream_url || program.stream));

        if (hasStream) {
            const playBtn = document.createElement('button');

            if (isProviderChannel) {
                // Provider channel - play the channel stream directly
                playBtn.className = 'btn-play-channel';
                playBtn.innerHTML = '<span>▶</span> Live';
                playBtn.dataset.channelId = channelId;
            } else {
                // Regular EPG - play the program stream
                playBtn.className = 'btn-play-tile';
                playBtn.innerHTML = '<span>▶</span> Play';
                playBtn.dataset.channelId = channelId;
                playBtn.dataset.programId = program.id;
            }

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
        expandBtn.dataset.channelId = channelId;
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

        const timeInfo = document.createElement('div');
        timeInfo.className = 'event-time';

        if (program.time_badge) {
            const timeBadge = document.createElement('span');
            timeBadge.className = program.time_badge.class;
            timeBadge.textContent = program.time_badge.text;

            if (program.time_badge.type === 'live') {
                const timeRange = document.createElement('span');
                timeRange.textContent = ` ${program.time_badge.timeRange}`;
                timeRange.style.color = 'var(--text-muted)';
                timeRange.style.marginLeft = '8px';
                timeInfo.appendChild(timeBadge);
                timeInfo.appendChild(timeRange);
            } else {
                timeInfo.appendChild(timeBadge);
            }
        } else {
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

        this.epgUI.setCurrentLoadingChannel(channel.id);
        this.epgUI.setIsLoadingMorePrograms(false);

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

        const logoUrl = channel.LogoUrl || channel.icon_url;
        if (logoUrl) {
            const logo = document.createElement('img');
            logo.className = 'channel-logo';
            logo.src = logoUrl;
            logo.alt = channel.Name || channel.display_name;
            logo.onerror = () => {
                this.epgUI.components.utilities.addLogoFallback(logoContainer, channel.Name || channel.display_name);
            };
            logoContainer.appendChild(logo);
        } else {
            this.epgUI.components.utilities.addLogoFallback(logoContainer, channel.Name || channel.display_name);
        }
        header.appendChild(logoContainer);

        const name = document.createElement('div');
        name.className = 'channel-daily-name';
        name.textContent = channel.Name || channel.display_name;
        header.appendChild(name);

        channelCard.appendChild(header);

        programs.forEach(program => {
            const programElement = this.createDailyProgramCardExpanded(channel, program);
            channelCard.appendChild(programElement);
        });

        content.appendChild(channelCard);

        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'load-more-programs-btn';
        loadMoreBtn.innerHTML = '▼ Mehr Programme laden';
        loadMoreBtn.dataset.channelId = channel.id;
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
            await this.epgUI.components.infiniteScroll.loadMoreDailyPrograms(channel.id);
        });

        content.appendChild(loadMoreBtn);

        container.style.display = 'block';
        container.classList.add('active');

        setTimeout(() => {
            this.epgUI.components.infiniteScroll.setupDailyProgramsInfiniteScroll(channel.id);
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    createDailyProgramCardExpanded(channel, program) {
        const now = new Date();
        const startTime = new Date(program.start_time);
        const endTime = new Date(program.end_time);

        const div = document.createElement('div');
        div.className = 'daily-program-card-expanded';

        const programId = program.id || program.program_id || `${channel.id}_${program.start_time}`;
        div.dataset.programId = String(programId);
        div.dataset.channelId = String(channel.id);

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

    createDailyProgramDetailsExpandedHTML(program) {
        const utilities = this.epgUI.components.utilities;

        let timeDisplay = '';
        if (program.time_badge) {
            timeDisplay = `
                <div class="program-time">
                    <span class="${program.time_badge.class}">${program.time_badge.text}</span>
                </div>
            `;
        } else {
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
            metaItems.push(`<span class="program-category">${utilities.escapeHtml(program.category)}</span>`);
        }
        if (program.duration) {
            metaItems.push(`<span class="program-duration">${program.duration} min</span>`);
        }
        if (program.rating) {
            metaItems.push(utilities.createRatingBadge(program.rating));
        }
        if (program.episode_formatted) {
            metaItems.push(`<span class="program-episode">${program.episode_formatted}</span>`);
        }
        if (program.directors) {
            metaItems.push(`<span class="program-directors">Regie: ${utilities.escapeHtml(program.directors)}</span>`);
        }
        if (program.actors) {
            const actors = program.actors.length > 100 ?
                program.actors.substring(0, 100) + '...' : program.actors;
            metaItems.push(`<span class="program-actors">Darsteller: ${utilities.escapeHtml(actors)}</span>`);
        }

        const metaHTML = metaItems.length > 0 ?
            `<div class="daily-program-meta-expanded">${metaItems.join('')}</div>` : '';

        const descriptionHTML = program.description ?
            `<div class="daily-program-description-expanded">${utilities.escapeHtml(program.description)}</div>` : '';

        const streamUrl = program.stream_url || program.stream;
        let playButton = '';
        if (streamUrl) {
            playButton = `<button class="btn-play" data-channel-id="${program.channel_id}" data-program-id="${program.id}">▶ Jetzt abspielen</button>`;
        }

        return `
            ${timeDisplay}
            <div class="daily-program-title-expanded">${utilities.escapeHtml(program.title)}</div>
            ${program.subtitle ? `<div class="program-subtitle">${utilities.escapeHtml(program.subtitle)}</div>` : ''}
            ${descriptionHTML}
            ${metaHTML}
            ${playButton}
        `;
    }
}

// Export for use
window.EPGRenderer = EPGRenderer;