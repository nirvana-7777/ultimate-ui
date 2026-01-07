// epg_player.js - Video player management
class EPGPlayer {
    constructor() {
        this.player = null;
        this.videoElement = null;
        this.currentStream = null;
        this.isPlaying = false;
    }

    async initialize() {
        this.videoElement = document.getElementById('floating-video');
        if (!this.videoElement) {
            console.warn('Video element not found');
            return;
        }

        // Setup player controls
        this.setupPlayerControls();

        // Initialize Shaka Player if available
        if (typeof shaka !== 'undefined') {
            await this.initializeShakaPlayer();
        }
    }

    async initializeShakaPlayer() {
        try {
            this.player = new shaka.Player(this.videoElement);
            this.player.configure({
                streaming: {
                    bufferingGoal: 30,
                    rebufferingGoal: 2
                }
            });

            console.log('Shaka Player initialized');
        } catch (error) {
            console.error('Error initializing Shaka Player:', error);
        }
    }

    async play(streamUrl, metadata = {}) {
        if (!this.videoElement) {
            await this.initialize();
        }

        this.currentStream = streamUrl;

        // Update player UI
        this.updatePlayerInfo(metadata);
        this.showPlayer();

        try {
            if (this.player && (streamUrl.includes('.mpd') || streamUrl.includes('.m3u8'))) {
                // Use Shaka for DASH/HLS
                await this.player.load(streamUrl);
            } else {
                // Use native video element
                this.videoElement.src = streamUrl;
            }

            await this.videoElement.play();
            this.isPlaying = true;

        } catch (error) {
            console.error('Error playing stream:', error);
            if (window.showToast) {
                window.showToast(`Fehler beim Abspielen: ${error.message}`, 'error');
            }
        }
    }

    stop() {
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.src = '';
        }

        if (this.player) {
            this.player.unload();
        }

        this.isPlaying = false;
        this.hidePlayer();
    }

    updatePlayerInfo(metadata) {
        const titleElement = document.getElementById('player-title');
        const subtitleElement = document.getElementById('player-subtitle');

        if (titleElement && metadata.title) {
            titleElement.textContent = metadata.title;
        }

        if (subtitleElement && metadata.subtitle) {
            subtitleElement.textContent = metadata.subtitle;
        }
    }

    showPlayer() {
        const playerElement = document.getElementById('floating-player');
        if (playerElement) {
            playerElement.classList.add('active');
        }
    }

    hidePlayer() {
        const playerElement = document.getElementById('floating-player');
        if (playerElement) {
            playerElement.classList.remove('active');
        }
    }

    setupPlayerControls() {
        // Minimize button
        const minimizeBtn = document.getElementById('player-minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => this.hidePlayer());
        }

        // Close button
        const closeBtn = document.getElementById('player-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.stop());
        }
    }

    destroy() {
        this.stop();

        if (this.player) {
            this.player.destroy();
            this.player = null;
        }

        this.videoElement = null;
    }
}

// Export for global access
window.EPGPlayer = EPGPlayer;