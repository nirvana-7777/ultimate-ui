// ui/EPGModalManager.js - Modal and dialog management
class EPGModalManager {
    constructor(epgUI) {
        this.epgUI = epgUI;
    }

    showProgramDetails(program) {
        this.closeProgramDetails();

        const modal = document.getElementById('program-details-modal');
        const content = document.getElementById('modal-program-content');

        if (!modal || !content) return;

        content.innerHTML = this.createProgramDetailsModalHTML(program);
        modal.classList.add('active');
        this.epgUI.setCurrentModal(modal);

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
        // Access utilities through epgUI
        const utilities = this.epgUI.components.utilities;
        const imageUrl = program.icon_url || program.image_url || '';

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
                    <span class="detail-value">${utilities.escapeHtml(program.category)}</span>
                </div>
            `);
        }

        if (program.rating) {
            detailItems.push(`
                <div class="detail-item">
                    <span class="detail-label">Altersfreigabe</span>
                    <span class="detail-value">${utilities.createRatingBadge(program.rating)}</span>
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
                    <span class="detail-value">${utilities.escapeHtml(program.directors)}</span>
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
                    <span class="detail-value">${utilities.escapeHtml(actors)}</span>
                </div>
            `);
        }

        const detailsGrid = detailItems.length > 0 ?
            `<div class="modal-program-details">${detailItems.join('')}</div>` : '';

        const streamUrl = program.stream_url || program.stream;

        return `
            <div class="modal-program-header">
                ${imageUrl ? 
                    `<img src="${imageUrl}" alt="${utilities.escapeHtml(program.title)}" class="modal-program-image" 
                         onerror="this.onerror=null; this.style.display='none'; this.parentNode.innerHTML='<div class=\\'modal-program-image\\' style=\\'background: linear-gradient(135deg, var(--bg-tertiary), var(--border-color)); display: flex; align-items: center; justify-content: center; color: var(--text-muted);\\'>Kein Bild</div>';">` :
                    `<div class="modal-program-image" style="background: linear-gradient(135deg, var(--bg-tertiary), var(--border-color)); display: flex; align-items: center; justify-content: center; color: var(--text-muted);">Kein Bild</div>`
                }
                <div class="modal-program-info">
                    <h3 class="modal-program-title">${utilities.escapeHtml(program.title)}</h3>
                    ${program.subtitle ? `<div class="modal-program-subtitle">${utilities.escapeHtml(program.subtitle)}</div>` : ''}
                    
                    <div class="modal-program-meta">
                        ${program.category ? `<span class="program-category">${utilities.escapeHtml(program.category)}</span>` : ''}
                        ${program.duration ? `<span class="program-duration">${program.duration} min</span>` : ''}
                        ${program.rating ? utilities.createRatingBadge(program.rating) : ''}
                        ${program.episode_formatted ? `<span class="program-episode">${program.episode_formatted}</span>` : ''}
                    </div>
                </div>
            </div>
            
            <div class="modal-program-description">
                ${program.description ? `<p>${utilities.escapeHtml(program.description)}</p>` : ''}
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
        const currentModal = this.epgUI.getCurrentModal();
        if (currentModal) {
            currentModal.classList.remove('active');
            this.epgUI.setCurrentModal(null);
        }
    }
}

// Export for use
window.EPGModalManager = EPGModalManager;