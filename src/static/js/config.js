/**
 * Ultimate UI - Configuration Page JavaScript
 */

class ConfigManager {
    constructor() {
        this.currentConfigTab = 'backend';
        this.configData = window.CONFIG_DATA || {};
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        this.setupTabNavigation();
        this.setupFormInteractions();
        this.setupActionButtons();
        this.loadSavedValues();

        this.initialized = true;
    }

    setupTabNavigation() {
        document.querySelectorAll('.config-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                this.switchConfigTab(tabName);
            });
        });
    }

    switchConfigTab(tabName) {
        this.currentConfigTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.config-tab').forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });

        const activeTab = document.getElementById('tab-' + tabName);
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.setAttribute('aria-selected', 'true');
        }

        // Update sections
        document.querySelectorAll('.config-section').forEach(section => {
            section.classList.remove('active');
        });

        const activeSection = document.getElementById('section-' + tabName);
        if (activeSection) {
            activeSection.classList.add('active');
        }
    }

    setupFormInteractions() {
        // Volume slider
        const volumeSlider = document.getElementById('default_volume');
        const volumeValue = document.getElementById('volume-value');

        if (volumeSlider && volumeValue) {
            volumeSlider.addEventListener('input', () => {
                volumeValue.textContent = volumeSlider.value;
                volumeSlider.setAttribute('aria-valuenow', volumeSlider.value);
            });
        }

        // Checkbox styling
        document.querySelectorAll('.checkbox-label input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const checkmark = e.target.nextElementSibling;
                if (e.target.checked) {
                    checkmark.classList.add('checked');
                } else {
                    checkmark.classList.remove('checked');
                }
            });
        });
    }

    setupActionButtons() {
        // Test connections
        const testWebEPGBtn = document.getElementById('test-webepg-btn');
        const testUltimateBtn = document.getElementById('test-ultimate-btn');

        if (testWebEPGBtn) {
            testWebEPGBtn.addEventListener('click', () => this.testWebEPGConnection());
        }

        if (testUltimateBtn) {
            testUltimateBtn.addEventListener('click', () => this.testUltimateBackendConnection());
        }

        // Save all config
        const saveBtn = document.getElementById('save-all-config-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveAllConfig());
        }

        // Reset config
        const resetBtn = document.getElementById('reset-config-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetConfig());
        }

        // Export config
        const exportBtn = document.getElementById('export-config-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportConfig());
        }

        // Import config
        const importBtn = document.getElementById('import-config-btn');
        const importFile = document.getElementById('import-file');

        if (importBtn && importFile) {
            importBtn.addEventListener('click', () => importFile.click());
            importFile.addEventListener('change', (e) => this.importConfig(e.target.files[0]));
        }
    }

    loadSavedValues() {
        // This would load values from localStorage or API
        // For now, we rely on the server-rendered values

        // Auto-test connections after a short delay
        setTimeout(() => {
            this.testWebEPGConnection();
            this.testUltimateBackendConnection();
        }, 1000);
    }

    async testWebEPGConnection() {
        const statusDiv = document.getElementById('webepg-status');
        const statusText = statusDiv?.querySelector('.status-text');

        if (!statusDiv || !statusText) return;

        statusDiv.className = 'connection-status testing';
        statusText.textContent = 'Teste Verbindung...';

        const startTime = Date.now();

        try {
            const response = await fetch('/api/test/webepg');
            const responseTime = Date.now() - startTime;
            const data = await response.json();

            if (data.success && data.status === 'online') {
                statusDiv.className = 'connection-status connected';
                statusText.textContent = `Verbindung erfolgreich (${responseTime}ms) - ${data.channels_count} Kanäle`;
                window.showToast?.(`WebEPG Verbindung erfolgreich: ${data.channels_count} Kanäle gefunden`, 'success');
            } else {
                statusDiv.className = 'connection-status error';
                statusText.textContent = 'Fehler: ' + (data.error || response.status);
                window.showToast?.('WebEPG Verbindung fehlgeschlagen: ' + (data.error || response.status), 'error');
            }
        } catch (error) {
            const responseTime = Date.now() - startTime;
            statusDiv.className = 'connection-status error';
            statusText.textContent = `Verbindung fehlgeschlagen (${responseTime}ms)`;
            window.showToast?.('WebEPG Verbindung fehlgeschlagen: ' + error.message, 'error');
        }
    }

    async testUltimateBackendConnection() {
        const statusDiv = document.getElementById('ultimate-backend-status');
        const statusText = statusDiv?.querySelector('.status-text');

        if (!statusDiv || !statusText) return;

        statusDiv.className = 'connection-status testing';
        statusText.textContent = 'Teste Verbindung...';

        try {
            const response = await fetch('/api/test/ultimate-backend');
            const data = await response.json();

            if (data.success && data.status === 'online') {
                statusDiv.className = 'connection-status connected';
                statusText.textContent = 'Verbindung erfolgreich';
                window.showToast?.('Ultimate Backend Verbindung erfolgreich', 'success');
            } else {
                statusDiv.className = 'connection-status error';
                statusText.textContent = 'Fehler: ' + (data.error || 'Unknown');
                window.showToast?.('Ultimate Backend Verbindung fehlgeschlagen: ' + (data.error || 'Unknown'), 'error');
            }
        } catch (error) {
            statusDiv.className = 'connection-status error';
            statusText.textContent = 'Verbindung fehlgeschlagen';
            window.showToast?.('Ultimate Backend Verbindung fehlgeschlagen: ' + error.message, 'error');
        }
    }

    async saveAllConfig() {
        if (window.showLoading) window.showLoading();

        const formData = new FormData();

        // Backend form
        formData.append('webepg_url', document.getElementById('webepg_url').value);
        formData.append('webepg_timeout', document.getElementById('webepg_timeout').value);
        formData.append('ultimate_backend_url', document.getElementById('ultimate_backend_url').value);
        formData.append('ultimate_backend_timeout', document.getElementById('ultimate_backend_timeout').value);

        // UI form
        formData.append('ui_theme', document.getElementById('ui_theme').value);
        formData.append('timezone', document.getElementById('timezone').value);
        formData.append('refresh_interval', document.getElementById('refresh_interval').value);

        // Player form
        formData.append('player_size', document.getElementById('player_size').value);
        formData.append('player_bitrate', document.getElementById('player_bitrate').value);
        formData.append('autoplay', document.getElementById('autoplay').checked ? 'true' : 'false');
        formData.append('muted', document.getElementById('muted').checked ? 'true' : 'false');
        formData.append('default_volume', document.getElementById('default_volume').value);

        // Advanced form
        formData.append('retention_days', document.getElementById('retention_days').value);
        formData.append('cache_enabled', document.getElementById('cache_enabled').checked ? 'true' : 'false');
        formData.append('cache_ttl', document.getElementById('cache_ttl').value);
        formData.append('log_level', document.getElementById('log_level').value);

        try {
            const response = await fetch('/config', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (window.hideLoading) window.hideLoading();

            if (data.success) {
                window.showToast?.('Konfiguration erfolgreich gespeichert!', 'success');
                setTimeout(() => window.location.reload(), 1000);
            } else {
                window.showToast?.('Fehler: ' + (data.message || 'Unbekannter Fehler'), 'error');
            }
        } catch (error) {
            if (window.hideLoading) window.hideLoading();
            window.showToast?.('Fehler beim Speichern: ' + error.message, 'error');
        }
    }

    async resetConfig() {
        if (!confirm('Alle Einstellungen auf Standardwerte zurücksetzen? Dies kann nicht rückgängig gemacht werden.')) {
            return;
        }

        if (window.showLoading) window.showLoading();

        try {
            const response = await fetch('/config/reset', {
                method: 'POST'
            });

            const data = await response.json();

            if (window.hideLoading) window.hideLoading();

            if (data.success) {
                window.showToast?.('Konfiguration zurückgesetzt!', 'success');
                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (error) {
            if (window.hideLoading) window.hideLoading();
            window.showToast?.('Fehler: ' + error.message, 'error');
        }
    }

    exportConfig() {
        const configData = {
            webepg: {
                url: document.getElementById('webepg_url').value,
                timeout: parseInt(document.getElementById('webepg_timeout').value, 10) || 10
            },
            ultimate_backend: {
                url: document.getElementById('ultimate_backend_url').value,
                timeout: parseInt(document.getElementById('ultimate_backend_timeout').value, 10) || 10
            },
            ui: {
                theme: document.getElementById('ui_theme').value,
                timezone: document.getElementById('timezone').value,
                refresh_interval: parseInt(document.getElementById('refresh_interval').value, 10) || 300
            },
            player: {
                default_size: document.getElementById('player_size').value,
                default_bitrate: document.getElementById('player_bitrate').value,
                autoplay: document.getElementById('autoplay').checked,
                muted: document.getElementById('muted').checked,
                default_volume: parseInt(document.getElementById('default_volume').value, 10) || 50
            },
            database: {
                retention_days: parseInt(document.getElementById('retention_days').value, 10) || 30
            },
            cache: {
                enabled: document.getElementById('cache_enabled').checked,
                ttl: parseInt(document.getElementById('cache_ttl').value, 10) || 300
            },
            logging: {
                level: document.getElementById('log_level').value
            }
        };

        const blob = new Blob([JSON.stringify(configData, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ultimate-ui-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        window.showToast?.('Konfiguration exportiert', 'success');
    }

    importConfig(file) {
        if (!file) return;

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const configData = JSON.parse(e.target.result);

                if (!configData.webepg || !configData.ui) {
                    throw new Error('Ungültiges Konfigurationsformat');
                }

                document.getElementById('webepg_url').value = configData.webepg.url || '';
                document.getElementById('webepg_timeout').value = configData.webepg.timeout || 10;

                if (configData.ultimate_backend) {
                    document.getElementById('ultimate_backend_url').value = configData.ultimate_backend.url || '';
                    document.getElementById('ultimate_backend_timeout').value = configData.ultimate_backend.timeout || 10;
                }

                if (configData.ui) {
                    document.getElementById('ui_theme').value = configData.ui.theme || 'dark';
                    document.getElementById('timezone').value = configData.ui.timezone || 'Europe/Berlin';
                    document.getElementById('refresh_interval').value = configData.ui.refresh_interval || 300;
                }

                window.showToast?.('Konfiguration importiert. Klicken Sie auf "Speichern" um zu übernehmen.', 'success');
            } catch (error) {
                window.showToast?.('Fehler beim Import: ' + error.message, 'error');
            }
        };

        reader.readAsText(file);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const configManager = new ConfigManager();
    configManager.init();

    // Make available globally if needed
    window.configManager = configManager;
});
