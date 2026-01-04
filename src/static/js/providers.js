/**
 * Ultimate UI - EPG Provider Management JavaScript
 * Handles the EPG Providers tab within Configuration
 */

class ProviderManager {
    constructor() {
        this.providers = [];
        this.importLogs = [];
        this.currentView = 'table';
        this.currentModal = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        this.setupEventListeners();
        await this.loadProviders();
        await this.loadImportLogs();
        this.updateStatistics();

        this.initialized = true;
    }

    setupEventListeners() {
        // Add provider buttons
        const addBtn = document.getElementById('add-provider-btn');
        const addFirstBtn = document.getElementById('add-first-provider-btn');

        if (addBtn) addBtn.addEventListener('click', () => this.showAddProviderModal());
        if (addFirstBtn) addFirstBtn.addEventListener('click', () => this.showAddProviderModal());

        // Action buttons
        const testAllBtn = document.getElementById('test-all-btn');
        const importAllBtn = document.getElementById('import-all-btn');
        const refreshBtn = document.getElementById('refresh-providers-btn');

        if (testAllBtn) testAllBtn.addEventListener('click', () => this.testAllConnections());
        if (importAllBtn) importAllBtn.addEventListener('click', () => this.importAllEnabled());
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshData());

        // View toggle
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.getAttribute('data-view');
                this.switchView(view);
            });
        });

        // Search input
        const searchInput = document.getElementById('provider-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterProviders(e.target.value));
        }
    }

    async loadProviders() {
        try {
            if (window.showLoading) window.showLoading('Lade Provider...');

            const url = `/api/providers`;
            console.log('Loading providers from:', url);

            const data = await this.makeRequest(url);
            this.providers = data || [];
            this.renderProviders();

            console.log(`Loaded ${this.providers.length} providers`);
        } catch (error) {
            console.error('Error loading providers:', error);
            if (window.showToast) window.showToast(`Fehler beim Laden der Provider: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async loadImportLogs() {
        try {
            const url = `/api/import/status`;
            console.log('Loading import logs from:', url);

            const data = await this.makeRequest(url);
            this.importLogs = data?.recent_imports || [];

            console.log(`Loaded ${this.importLogs.length} import logs`);
        } catch (error) {
            console.error('Error loading import logs:', error);
        }
    }

    async makeRequest(url, options = {}) {
        try {
            console.log('Making request to:', url);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }

            return await response.text();
        } catch (error) {
            console.error('Request failed:', error);

            if (error.name === 'AbortError') {
                throw new Error('Request timeout after 10 seconds');
            }

            if (error.message.includes('Failed to fetch')) {
                throw new Error('Network error: Could not connect to server');
            }

            throw error;
        }
    }

    async postData(url, data) {
        return await this.makeRequest(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async putData(url, data) {
        return await this.makeRequest(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteData(url) {
        return await this.makeRequest(url, {
            method: 'DELETE'
        });
    }

    getProviderImportLogs(providerId) {
        return this.importLogs
            .filter(log => log.provider_id === providerId)
            .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    }

    getLatestImportLog(providerId) {
        const logs = this.getProviderImportLogs(providerId);
        return logs.length > 0 ? logs[0] : null;
    }

    renderProviders() {
        this.renderTableView();
        this.renderCardsView();
        this.toggleEmptyState();
    }

    renderTableView() {
        const tbody = document.getElementById('providers-table-body');
        if (!tbody) return;

        if (this.providers.length === 0) {
            tbody.innerHTML = '';
            return;
        }

        let html = '';

        this.providers.forEach(provider => {
            const latestImport = this.getLatestImportLog(provider.id);

            html += `
                <tr data-provider-id="${provider.id}">
                    <td>
                        <div class="provider-status">
                            <span class="status-dot ${provider.enabled ? 'enabled' : 'disabled'}"></span>
                            <span class="status-text">${provider.enabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                    </td>
                    <td>
                        <strong>${this.escapeHtml(provider.name)}</strong>
                        <br>
                        <small class="text-muted">ID: ${provider.id}</small>
                    </td>
                    <td>
                        <div class="provider-url">
                            <span class="url-text" title="${this.escapeHtml(provider.xmltv_url)}">
                                ${this.escapeHtml(this.truncateUrl(provider.xmltv_url))}
                            </span>
                            <button class="btn-copy" onclick="navigator.clipboard.writeText('${this.escapeHtml(provider.xmltv_url)}'); window.showToast('URL kopiert', 'success')" title="URL kopieren">
                                📋
                            </button>
                        </div>
                    </td>
                    <td>
                        <div class="last-import">
                            ${latestImport ? `
                                <span class="import-time">${this.formatRelativeTime(latestImport.completed_at || latestImport.started_at)}</span>
                                <span class="import-status ${latestImport.status}">${latestImport.status}</span>
                            ` : '<span class="text-muted">Nie</span>'}
                        </div>
                    </td>
                    <td>
                        ${latestImport ? `
                            <div class="import-stats">
                                <div class="stats-row">
                                    <span>Importiert:</span>
                                    <strong>${latestImport.programs_imported || 0}</strong>
                                </div>
                                <div class="stats-row">
                                    <span>Übersprungen:</span>
                                    <strong>${latestImport.programs_skipped || 0}</strong>
                                </div>
                            </div>
                        ` : '<span class="text-muted">Keine Daten</span>'}
                    </td>
                    <td class="text-center">
                        <div class="provider-actions">
                            <button class="action-btn edit" onclick="window.providerManager.showEditProviderModal(${provider.id})" title="Bearbeiten">
                                ✏️
                            </button>
                            <button class="action-btn test" onclick="window.providerManager.testProviderConnection(${provider.id})" title="Testen">
                                🔍
                            </button>
                            <button class="action-btn import" onclick="window.providerManager.triggerProviderImport(${provider.id})" title="Import starten">
                                🔄
                            </button>
                            <button class="action-btn toggle" onclick="window.providerManager.toggleProviderStatus(${provider.id}, ${!provider.enabled})" title="${provider.enabled ? 'Deaktivieren' : 'Aktivieren'}">
                                ${provider.enabled ? '⏸️' : '▶️'}
                            </button>
                            <button class="action-btn delete" onclick="window.providerManager.deleteProvider(${provider.id})" title="Löschen">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    renderCardsView() {
        const cardsGrid = document.getElementById('providers-cards-grid');
        if (!cardsGrid) return;

        if (this.providers.length === 0) {
            cardsGrid.innerHTML = '';
            return;
        }

        let html = '';

        this.providers.forEach(provider => {
            const latestImport = this.getLatestImportLog(provider.id);

            html += `
                <div class="provider-card" data-provider-id="${provider.id}">
                    <div class="card-header">
                        <div class="card-title">
                            <span class="card-name">${this.escapeHtml(provider.name)}</span>
                            <span class="card-id">#${provider.id}</span>
                        </div>
                        <div class="provider-status">
                            <span class="status-dot ${provider.enabled ? 'enabled' : 'disabled'}"></span>
                            <span class="status-text">${provider.enabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                    </div>
                    
                    <div class="card-url" title="${this.escapeHtml(provider.xmltv_url)}">
                        ${this.escapeHtml(this.truncateUrl(provider.xmltv_url, 50))}
                    </div>
                    
                    <div class="card-details">
                        <div class="detail-item">
                            <span class="detail-label">Letzter Import</span>
                            <span class="detail-value">
                                ${latestImport ? this.formatRelativeTime(latestImport.completed_at || latestImport.started_at) : 'Nie'}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">
                                ${latestImport ? `<span class="import-status ${latestImport.status}">${latestImport.status}</span>` : 'N/A'}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Importiert</span>
                            <span class="detail-value">
                                ${latestImport ? (latestImport.programs_imported || 0) : '0'}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Übersprungen</span>
                            <span class="detail-value">
                                ${latestImport ? (latestImport.programs_skipped || 0) : '0'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="card-actions">
                        <button class="card-btn secondary" onclick="window.providerManager.showEditProviderModal(${provider.id})">
                            ✏️ Bearbeiten
                        </button>
                        <button class="card-btn secondary" onclick="window.providerManager.testProviderConnection(${provider.id})">
                            🔍 Testen
                        </button>
                        <button class="card-btn primary" onclick="window.providerManager.triggerProviderImport(${provider.id})">
                            🔄 Import
                        </button>
                    </div>
                </div>
            `;
        });

        cardsGrid.innerHTML = html;
    }

    toggleEmptyState() {
        const emptyState = document.getElementById('empty-state');
        const tableView = document.getElementById('table-view');
        const cardsView = document.getElementById('cards-view');

        if (!emptyState || !tableView || !cardsView) return;

        if (this.providers.length === 0) {
            emptyState.classList.remove('hidden');
            tableView.classList.add('hidden');
            cardsView.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            tableView.classList.remove('hidden');
            cardsView.classList.remove('hidden');
        }
    }

    updateStatistics() {
        const total = this.providers.length;
        const enabled = this.providers.filter(p => p.enabled).length;
        const disabled = total - enabled;

        const successfulImports = this.importLogs.filter(log => log.status === 'success').length;
        const totalImports = this.importLogs.length;
        const successRate = totalImports > 0 ? Math.round((successfulImports / totalImports) * 100) : 0;

        const totalEl = document.getElementById('total-providers');
        const enabledEl = document.getElementById('enabled-providers');
        const disabledEl = document.getElementById('disabled-providers');
        const rateEl = document.getElementById('success-rate');

        if (totalEl) totalEl.textContent = total;
        if (enabledEl) enabledEl.textContent = enabled;
        if (disabledEl) disabledEl.textContent = disabled;
        if (rateEl) rateEl.textContent = `${successRate}%`;
    }

    switchView(view) {
        this.currentView = view;

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-view') === view);
        });

        const tableView = document.getElementById('table-view');
        const cardsView = document.getElementById('cards-view');

        if (tableView && cardsView) {
            if (view === 'table') {
                tableView.classList.add('active');
                cardsView.classList.remove('active');
            } else {
                tableView.classList.remove('active');
                cardsView.classList.add('active');
            }
        }
    }

    filterProviders(searchTerm) {
        const term = searchTerm.toLowerCase().trim();

        document.querySelectorAll('#providers-table-body tr[data-provider-id]').forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });

        document.querySelectorAll('.provider-card').forEach(card => {
            const text = card.textContent.toLowerCase();
            card.style.display = text.includes(term) ? '' : 'none';
        });
    }

    showAddProviderModal() {
        if (!window.UTILS || !window.UTILS.UIComponents) {
            alert('Modal system nicht verfügbar. Bitte Seite neu laden.');
            return;
        }

        const modal = window.UTILS.UIComponents.createModal({
            title: 'Neuen EPG Provider hinzufügen',
            content: `
                <form id="add-provider-form" class="modal-form">
                    <div class="form-group">
                        <label for="provider-name">Provider Name *</label>
                        <input type="text" id="provider-name" class="form-input" required 
                               placeholder="z.B. Meine EPG Quelle">
                    </div>
                    <div class="form-group">
                        <label for="provider-url">XMLTV URL *</label>
                        <input type="url" id="provider-url" class="form-input" required 
                               placeholder="https://example.com/epg.xml">
                        <small class="text-muted">Vollständige URL zur XMLTV-Datei</small>
                    </div>
                    <div class="form-group">
                        <div class="checkbox-group">
                            <input type="checkbox" id="provider-enabled" checked>
                            <label for="provider-enabled" class="checkbox-label">
                                Provider aktivieren (automatischer Import)
                            </label>
                        </div>
                    </div>
                </form>
            `,
            buttons: [
                {
                    text: 'Abbrechen',
                    className: 'modal-btn secondary',
                    closeOnClick: true
                },
                {
                    text: 'Verbindung testen',
                    className: 'modal-btn secondary',
                    onClick: () => this.testNewProviderConnection(),
                    closeOnClick: false
                },
                {
                    text: 'Provider speichern',
                    className: 'modal-btn primary',
                    onClick: () => this.saveNewProvider(),
                    closeOnClick: false
                }
            ]
        });

        this.currentModal = modal;
    }

    async testNewProviderConnection() {
        const name = document.getElementById('provider-name')?.value;
        const url = document.getElementById('provider-url')?.value;

        if (!name || !url) {
            if (window.showToast) window.showToast('Bitte Name und URL eingeben', 'warning');
            return;
        }

        try {
            if (window.showLoading) window.showLoading('Teste Verbindung...');
            const response = await fetch(url, { method: 'HEAD' });

            if (response.ok) {
                if (window.showToast) window.showToast('Verbindung erfolgreich! XMLTV URL ist erreichbar.', 'success');
            } else {
                if (window.showToast) window.showToast(`Verbindung fehlgeschlagen: ${response.status} ${response.statusText}`, 'error');
            }
        } catch (error) {
            if (window.showToast) window.showToast(`Verbindungsfehler: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async saveNewProvider() {
        const name = document.getElementById('provider-name')?.value;
        const url = document.getElementById('provider-url')?.value;
        const enabled = document.getElementById('provider-enabled')?.checked;

        if (!name || !url) {
            if (window.showToast) window.showToast('Bitte alle Pflichtfelder ausfüllen', 'warning');
            return;
        }

        try {
            if (window.showLoading) window.showLoading('Speichere Provider...');

            const apiUrl = `/api/providers`;
            await this.postData(apiUrl, {
                name: name,
                xmltv_url: url,
                enabled: enabled
            });

            if (window.showToast) window.showToast('Provider erfolgreich hinzugefügt!', 'success');

            if (this.currentModal) {
                this.currentModal.close();
            }

            await this.refreshData();

        } catch (error) {
            if (window.showToast) window.showToast(`Fehler beim Hinzufügen: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async showEditProviderModal(providerId) {
        const provider = this.providers.find(p => p.id === providerId);
        if (!provider) return;

        if (!window.UTILS || !window.UTILS.UIComponents) {
            alert('Modal system nicht verfügbar. Bitte Seite neu laden.');
            return;
        }

        const modal = window.UTILS.UIComponents.createModal({
            title: 'EPG Provider bearbeiten',
            content: `
                <form id="edit-provider-form" class="modal-form">
                    <div class="form-group">
                        <label for="edit-provider-name">Provider Name *</label>
                        <input type="text" id="edit-provider-name" class="form-input" required 
                               value="${this.escapeHtml(provider.name)}">
                    </div>
                    <div class="form-group">
                        <label for="edit-provider-url">XMLTV URL *</label>
                        <input type="url" id="edit-provider-url" class="form-input" required 
                               value="${this.escapeHtml(provider.xmltv_url)}">
                    </div>
                    <div class="form-group">
                        <div class="checkbox-group">
                            <input type="checkbox" id="edit-provider-enabled" ${provider.enabled ? 'checked' : ''}>
                            <label for="edit-provider-enabled" class="checkbox-label">
                                Provider aktivieren
                            </label>
                        </div>
                    </div>
                </form>
            `,
            buttons: [
                {
                    text: 'Abbrechen',
                    className: 'modal-btn secondary',
                    closeOnClick: true
                },
                {
                    text: 'Verbindung testen',
                    className: 'modal-btn secondary',
                    onClick: () => this.testEditProviderConnection(providerId),
                    closeOnClick: false
                },
                {
                    text: 'Änderungen speichern',
                    className: 'modal-btn primary',
                    onClick: () => this.updateProvider(providerId),
                    closeOnClick: false
                }
            ]
        });

        this.currentModal = modal;
    }

    async testEditProviderConnection(providerId) {
        const url = document.getElementById('edit-provider-url')?.value;

        if (!url) {
            if (window.showToast) window.showToast('Bitte URL eingeben', 'warning');
            return;
        }

        await this.testProviderConnection(providerId, url);
    }

    async updateProvider(providerId) {
        const name = document.getElementById('edit-provider-name')?.value;
        const url = document.getElementById('edit-provider-url')?.value;
        const enabled = document.getElementById('edit-provider-enabled')?.checked;

        if (!name || !url) {
            if (window.showToast) window.showToast('Bitte alle Pflichtfelder ausfüllen', 'warning');
            return;
        }

        try {
            if (window.showLoading) window.showLoading('Aktualisiere Provider...');

            const apiUrl = `/api/providers/${providerId}`;
            await this.putData(apiUrl, {
                name: name,
                xmltv_url: url,
                enabled: enabled
            });

            if (window.showToast) window.showToast('Provider erfolgreich aktualisiert!', 'success');

            if (this.currentModal) {
                this.currentModal.close();
            }

            await this.refreshData();

        } catch (error) {
            if (window.showToast) window.showToast(`Fehler beim Aktualisieren: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async toggleProviderStatus(providerId, enabled) {
        try {
            const provider = this.providers.find(p => p.id === providerId);
            if (!provider) return;

            if (window.showLoading) window.showLoading(`${enabled ? 'Aktiviere' : 'Deaktiviere'} Provider...`);

            const apiUrl = `/api/providers/${providerId}`;
            await this.putData(apiUrl, {
                name: provider.name,
                xmltv_url: provider.xmltv_url,
                enabled: enabled
            });

            if (window.showToast) window.showToast(`Provider ${enabled ? 'aktiviert' : 'deaktiviert'}!`, 'success');
            await this.refreshData();

        } catch (error) {
            if (window.showToast) window.showToast(`Fehler beim Ändern des Status: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async deleteProvider(providerId) {
        if (!confirm('Sind Sie sicher, dass Sie diesen Provider löschen möchten? Dies kann nicht rückgängig gemacht werden.')) {
            return;
        }

        try {
            if (window.showLoading) window.showLoading('Lösche Provider...');

            const apiUrl = `/api/providers/${providerId}`;
            await this.deleteData(apiUrl);

            if (window.showToast) window.showToast('Provider erfolgreich gelöscht!', 'success');
            await this.refreshData();

        } catch (error) {
            if (window.showToast) window.showToast(`Fehler beim Löschen: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async testProviderConnection(providerId, customUrl = null) {
        const provider = this.providers.find(p => p.id === providerId);
        if (!provider) return;

        const url = customUrl || provider.xmltv_url;

        if (!window.UTILS || !window.UTILS.UIComponents) {
            alert('Modal system nicht verfügbar. Bitte Seite neu laden.');
            return;
        }

        const modal = window.UTILS.UIComponents.createModal({
            title: 'Verbindung testen',
            content: `
                <div class="test-status testing">
                    <div class="loading-spinner-small"></div>
                    <span>Teste Verbindung zu: ${this.escapeHtml(this.truncateUrl(url, 50))}</span>
                </div>
                <div class="test-details" id="test-details">Starte Test...</div>
            `,
            buttons: [
                {
                    text: 'Schließen',
                    className: 'modal-btn secondary',
                    closeOnClick: true
                }
            ],
            backdropClose: false
        });

        try {
            const response = await fetch(`/api/providers/${providerId}/test`);
            const result = await response.json();

            let details = `Status: ${result.status}\n`;
            if (result.content_type) {
                details += `Content-Type: ${result.content_type}\n`;
            }
            if (result.is_xmltv !== undefined) {
                details += `Gültiges XMLTV: ${result.is_xmltv ? '✓ Ja' : '✗ Nein'}\n`;
            }
            if (result.message) {
                details += `\n${result.message}`;
            }

            if (result.success) {
                modal.updateContent(`
                    <div class="test-status success">
                        <span>✅ Verbindung erfolgreich!</span>
                    </div>
                    <div class="test-details">${details}</div>
                `);
                if (window.showToast) window.showToast('Verbindungstest erfolgreich!', 'success');
            } else {
                modal.updateContent(`
                    <div class="test-status error">
                        <span>❌ Verbindung fehlgeschlagen</span>
                    </div>
                    <div class="test-details">${details}</div>
                `);
                if (window.showToast) window.showToast('Verbindungstest fehlgeschlagen', 'error');
            }
        } catch (error) {
            modal.updateContent(`
                <div class="test-status error">
                    <span>❌ Verbindungsfehler</span>
                </div>
                <div class="test-details">${error.message}</div>
            `);
            if (window.showToast) window.showToast(`Verbindungsfehler: ${error.message}`, 'error');
        }
    }

    async triggerProviderImport(providerId) {
        try {
            if (window.showLoading) window.showLoading('Starte Import...');

            const apiUrl = `/api/providers/${providerId}/import/trigger`;
            await this.postData(apiUrl, {});

            if (window.showToast) window.showToast('Import erfolgreich gestartet!', 'success');

            setTimeout(() => this.refreshData(), 2000);

        } catch (error) {
            if (window.showToast) window.showToast(`Fehler beim Starten des Imports: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async testAllConnections() {
        try {
            if (window.showLoading) window.showLoading('Teste alle Provider-Verbindungen...');

            const enabledProviders = this.providers.filter(p => p.enabled);
            let successful = 0;
            let failed = 0;

            for (const provider of enabledProviders) {
                try {
                    const response = await fetch(`/api/providers/${provider.id}/test`);
                    const result = await response.json();
                    if (result.success) {
                        successful++;
                    } else {
                        failed++;
                    }
                } catch {
                    failed++;
                }
            }

            const message = `Verbindungstest abgeschlossen: ${successful} erfolgreich, ${failed} fehlgeschlagen`;
            if (window.showToast) {
                window.showToast(message,
                    failed === 0 ? 'success' : failed === enabledProviders.length ? 'error' : 'warning');
            }

        } catch (error) {
            if (window.showToast) window.showToast(`Fehler beim Testen: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async importAllEnabled() {
        if (!confirm('Import für alle aktivierten Provider starten? Dies kann mehrere Minuten dauern.')) {
            return;
        }

        try {
            if (window.showLoading) window.showLoading('Starte Import für alle aktivierten Provider...');

            const apiUrl = `/api/import/trigger`;
            await this.postData(apiUrl, {});

            if (window.showToast) window.showToast('Import für alle Provider gestartet!', 'success');

            setTimeout(() => this.refreshData(), 3000);

        } catch (error) {
            if (window.showToast) window.showToast(`Fehler beim Starten des Imports: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async refreshData() {
        await this.loadProviders();
        await this.loadImportLogs();
        this.updateStatistics();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateUrl(url, maxLength = 40) {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength - 3) + '...';
    }

    formatRelativeTime(dateString) {
        if (!dateString) return 'Nie';

        try {
            if (window.UTILS && window.UTILS.DateTime) {
                return window.UTILS.DateTime.format(dateString, 'relative');
            }

            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Gerade eben';
            if (diffMins < 60) return `vor ${diffMins} Minuten`;
            if (diffHours < 24) return `vor ${diffHours} Stunden`;
            if (diffDays < 7) return `vor ${diffDays} Tagen`;

            return date.toLocaleDateString('de-DE');
        } catch {
            return dateString;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const providerManager = new ProviderManager();

    // Don't auto-initialize - let config.js call init() when switching to providers tab
    // This avoids loading provider data when not needed

    window.providerManager = providerManager;
});