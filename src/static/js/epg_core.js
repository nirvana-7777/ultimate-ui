// epg_core.js - Enhanced with smart time badges and multi-day support
class EPGCore {
    constructor() {
        this.config = {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            dateFormat: 'de-DE',
            refreshInterval: 300,
            itemsPerPage: 50
        };

        this.channels = [];
        this.currentEvents = new Map();
        this.dailyPrograms = new Map();
        this.cache = new Map();
        this.isLoading = false;
        this.currentDate = new Date();
        this.hasMoreChannels = true;
        this.currentPage = 0;

        // New: Track loaded date ranges for infinite scroll
        this.loadedDateRanges = new Map(); // channelId -> Set of date strings
    }

    async fetchChannels(page = 0) {
        try {
            const cacheKey = `channels_${page}`;
            const cached = this.cache.get(cacheKey);

            if (cached) {
                return cached;
            }

            const response = await fetch(
                `/api/epg/channels?page=${page}&limit=${this.config.itemsPerPage}`
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success || !Array.isArray(data.channels)) {
                throw new Error('Invalid response format from channels endpoint');
            }

            const result = {
                channels: data.channels,
                hasMore: data.has_more || data.channels.length === this.config.itemsPerPage
            };

            this.cache.set(cacheKey, result);
            return result;

        } catch (error) {
            console.error('Error fetching channels:', error);
            throw new Error('Kanäle konnten nicht geladen werden: ' + error.message);
        }
    }

    calculateDuration(startTime, endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        const diff = end - start;
        return Math.round(diff / (1000 * 60));
    }

    async fetchProgramsForChannel(channelId, startDate, endDate) {
        try {
            const cacheKey = `programs_${channelId}_${startDate.toISOString().split('T')[0]}`;
            const cached = this.cache.get(cacheKey);

            if (cached) {
                return cached;
            }

            const response = await fetch(
                `/api/channels/${channelId}/programs?start=${startDate.toISOString()}&end=${endDate.toISOString()}`
            );

            if (!response.ok) {
                console.warn(`HTTP ${response.status} for channel ${channelId} programs`);
                return [];
            }

            const data = await response.json();

            let programs = [];

            if (data.success && Array.isArray(data.programs)) {
                programs = data.programs;
            } else if (Array.isArray(data)) {
                programs = data;
            }

            // Process and enrich each program
            programs.forEach(program => {
                program.channel_id = channelId;
                program.image_url = program.icon_url;
                program.stream_url = program.stream;
                program.duration = program.duration || this.calculateDuration(
                    program.start_time,
                    program.end_time
                );

                program.start_time_local = this.formatDateTime(program.start_time, 'time');
                program.end_time_local = this.formatDateTime(program.end_time, 'time');
                program.date_local = this.formatDateTime(program.start_time, 'date');

                program.episode_formatted = this.parseXmltvNsEpisode(program.episode_num);

                // Calculate progress if program is currently airing
                const now = new Date();
                const start = new Date(program.start_time);
                const end = new Date(program.end_time);

                program.is_live = start <= now && end >= now;

                if (program.is_live) {
                    program.progress = this.calculateProgress(program.start_time, program.end_time);
                    program.time_remaining = this.calculateTimeRemaining(program.end_time);
                }

                // NEW: Add smart time badge
                program.time_badge = this.getSmartTimeBadge(program.start_time, program.end_time);
            });

            this.cache.set(cacheKey, programs);
            return programs;

        } catch (error) {
            console.warn(`Error fetching programs for channel ${channelId}:`, error);
            return [];
        }
    }

    // Updated getSmartTimeBadge method for epg_core.js
    getSmartTimeBadge(startTime, endTime) {
        const now = new Date();
        const start = new Date(startTime);
        const end = new Date(endTime);

        // Check if it's currently airing
        const isToday = this.isSameDay(now, start);
        const isYesterday = this.isYesterday(start);
        const isTomorrow = this.isTomorrow(start);

        // Calculate if program is currently airing
        const isCurrentlyAiring = start <= now && end >= now;

        if (isCurrentlyAiring) {
            return {
                type: 'live',
                text: 'LIVE',
                timeRange: this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                class: 'time-badge live'
            };
        } else if (isToday) {
            // Today but not yet started - show only time range
            return {
                type: 'today',
                text: this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                timeRange: this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                class: 'time-badge today'
            };
        } else if (isTomorrow) {
            // Tomorrow - show "Morgen HH:MM - HH:MM"
            return {
                type: 'tomorrow',
                text: 'Morgen ' + this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                timeRange: 'Morgen ' + this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                class: 'time-badge tomorrow'
            };
        } else if (isYesterday) {
            // Yesterday - show "Gestern HH:MM - HH:MM"
            return {
                type: 'yesterday',
                text: 'Gestern ' + this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                timeRange: 'Gestern ' + this.formatDateTime(startTime, 'time') + ' - ' + this.formatDateTime(endTime, 'time'),
                class: 'time-badge yesterday'
            };
        } else {
            // Future date - show "DD.MM. HH:MM - HH:MM"
            const dateStr = this.formatDateTime(startTime, 'short-date');
            return {
                type: 'future',
                text: `${dateStr} ${this.formatDateTime(startTime, 'time')} - ${this.formatDateTime(endTime, 'time')}`,
                timeRange: `${dateStr} ${this.formatDateTime(startTime, 'time')} - ${this.formatDateTime(endTime, 'time')}`,
                class: 'time-badge future'
            };
        }
    }

    // Add this helper method
    isYesterday(date) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return this.isSameDay(yesterday, date);
    }

    async loadDataForDate(date) {
        this.isLoading = true;
        this.cache.clear();

        try {
            const { channels, hasMore } = await this.fetchChannels(0);
            this.channels = channels;
            this.hasMoreChannels = hasMore;
            this.currentPage = 0;

            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            await this.processChannelsWithPrograms(channels, now, tomorrow);

            return {
                channels,
                currentEvents: this.currentEvents,
                dailyPrograms: this.dailyPrograms
            };

        } finally {
            this.isLoading = false;
        }
    }

    async processChannelsWithPrograms(channels, startDate, endDate) {
        this.currentEvents.clear();
        this.dailyPrograms.clear();

        const now = new Date();

        const programPromises = channels.map(async (channel) => {
            try {
                const programs = await this.fetchProgramsForChannel(
                    channel.id,
                    startDate,
                    endDate
                );

                channel.programs = programs;

                // Find current event
                const currentProgram = programs.find(program => {
                    const start = new Date(program.start_time);
                    const end = new Date(program.end_time);
                    return start <= now && end >= now;
                });

                if (currentProgram) {
                    currentProgram.channel_name = channel.display_name || channel.name;
                    currentProgram.channel_icon = channel.icon_url;

                    this.currentEvents.set(channel.id, currentProgram);
                }

                this.dailyPrograms.set(channel.id, programs);

            } catch (error) {
                console.warn(`Error processing channel ${channel.id}:`, error);
                channel.programs = [];
            }
        });

        await Promise.all(programPromises);
    }

    async loadMoreChannels() {
        if (!this.hasMoreChannels || this.isLoading) {
            return false;
        }

        this.isLoading = true;
        this.currentPage++;

        try {
            const { channels, hasMore } = await this.fetchChannels(this.currentPage);

            if (channels.length > 0) {
                this.channels = [...this.channels, ...channels];
                this.hasMoreChannels = hasMore;

                const now = new Date();
                const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

                await this.processChannelsWithPrograms(channels, now, tomorrow);
            }

            return channels.length > 0;

        } finally {
            this.isLoading = false;
        }
    }

    // NEW: Load next day's programs for a specific channel
    async loadNextDayForChannel(channelId, currentEndDate) {
        try {
            const nextDayStart = new Date(currentEndDate);
            nextDayStart.setHours(0, 0, 0, 0);

            const nextDayEnd = new Date(nextDayStart);
            nextDayEnd.setHours(23, 59, 59, 999);

            const dateKey = nextDayStart.toISOString().split('T')[0];

            // Check if we've already loaded this date for this channel
            if (!this.loadedDateRanges.has(channelId)) {
                this.loadedDateRanges.set(channelId, new Set());
            }

            const loadedDates = this.loadedDateRanges.get(channelId);
            if (loadedDates.has(dateKey)) {
                return []; // Already loaded
            }

            const programs = await this.fetchProgramsForChannel(
                channelId,
                nextDayStart,
                nextDayEnd
            );

            loadedDates.add(dateKey);

            // Append to existing programs
            const existingPrograms = this.dailyPrograms.get(channelId) || [];
            const allPrograms = [...existingPrograms, ...programs];
            this.dailyPrograms.set(channelId, allPrograms);

            return programs;

        } catch (error) {
            console.warn(`Error loading next day for channel ${channelId}:`, error);
            return [];
        }
    }

    formatDateTime(dateTime, format = 'datetime') {
        const date = new Date(dateTime);
        const options = {
            timeZone: this.config.timezone,
            hour12: false
        };

        switch (format) {
            case 'date':
                Object.assign(options, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                return date.toLocaleDateString(this.config.dateFormat, options);

            case 'time':
                Object.assign(options, {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return date.toLocaleTimeString(this.config.dateFormat, options);

            case 'short-date':
                Object.assign(options, {
                    day: '2-digit',
                    month: '2-digit'
                });
                return date.toLocaleDateString(this.config.dateFormat, options);

            default:
                Object.assign(options, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return date.toLocaleString(this.config.dateFormat, options);
        }
    }

    calculateProgress(startTime, endTime) {
        const now = new Date();
        const start = new Date(startTime);
        const end = new Date(endTime);

        if (now < start || now > end) return null;

        const total = end - start;
        const elapsed = now - start;
        const percentage = (elapsed / total) * 100;

        return {
            percentage,
            duration: Math.round((end - start) / 60000),
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
            return `noch ${hours}h ${minutes} min`;
        }
        return `noch ${minutes} min`;
    }

    getProgram(channelId, programId) {
        const programs = this.dailyPrograms.get(channelId);
        return programs?.find(p => p.id === programId);
    }

    getChannel(channelId) {
        const id = typeof channelId === 'string' ? parseInt(channelId, 10) : channelId;
        return this.channels.find(c => c.id === id || c.id === channelId);
    }

    navigateDate(days) {
        this.currentDate.setDate(this.currentDate.getDate() + days);
        this.cache.clear();
        this.currentEvents.clear();
        this.dailyPrograms.clear();
        this.loadedDateRanges.clear();
    }

    goToToday() {
        this.currentDate = new Date();
        this.cache.clear();
        this.currentEvents.clear();
        this.dailyPrograms.clear();
        this.loadedDateRanges.clear();
    }

    clearCache() {
        this.cache.clear();
    }

    async loadDailyProgramsForChannel(channelId, date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        return await this.fetchProgramsForChannel(channelId, startDate, endDate);
    }

    parseXmltvNsEpisode(episodeNum) {
        if (!episodeNum || typeof episodeNum !== 'string') {
            return null;
        }

        episodeNum = episodeNum.trim();
        episodeNum = episodeNum.replace(/\.$/, '');

        const parts = episodeNum.split('.');

        if (parts.length < 2 || parts[0] === '' || parts[1] === '') {
            return null;
        }

        const season = parseInt(parts[0], 10);
        const episode = parseInt(parts[1], 10);

        if (isNaN(season) || isNaN(episode) || season < 0 || episode < 0) {
            return null;
        }

        const displaySeason = season + 1;
        const displayEpisode = episode + 1;

        if (season === 0) {
            let result = `S01E${displayEpisode.toString().padStart(2, '0')}`;

            if (parts.length >= 3 && parts[2]) {
                const partInfo = this.parsePartInfo(parts[2]);
                if (partInfo) {
                    result += ` (Part ${partInfo.current}/${partInfo.total})`;
                }
            }
            return result;
        }

        let result = `S${displaySeason.toString().padStart(2, '0')}E${displayEpisode.toString().padStart(2, '0')}`;

        if (parts.length >= 3 && parts[2]) {
            const partInfo = this.parsePartInfo(parts[2]);
            if (partInfo) {
                result += ` (Part ${partInfo.current}/${partInfo.total})`;
            }
        }

        return result;
    }

    parsePartInfo(partString) {
        if (!partString) return null;

        const partParts = partString.split('/');
        if (partParts.length !== 2) return null;

        const partCurrent = parseInt(partParts[0], 10);
        const partTotal = parseInt(partParts[1], 10);

        if (isNaN(partCurrent) || isNaN(partTotal) ||
            partCurrent < 0 || partTotal < 1 || partCurrent >= partTotal) {
            return null;
        }

        return {
            current: partCurrent + 1,
            total: partTotal
        };
    }
}