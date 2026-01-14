// ui/EPGUtilities.js - Utility and helper functions
class EPGUtilities {
    constructor() {}

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

// Export for use
window.EPGUtilities = EPGUtilities;