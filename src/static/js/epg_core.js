// epg_core.js - Fixed with "m" format for time remaining
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

                // Calculate progress if program is currently airing
                const now = new Date();
                const start = new Date(program.start_time);
                const end = new Date(program.end_time);

                program.is_live = start <= now && end >= now;

                if (program.is_live) {
                    program.progress = this.calculateProgress(program.start_time, program.end_time);
                    program.time_remaining = this.calculateTimeRemaining(program.end_time);
                }
            });

            this.cache.set(cacheKey, programs);
            return programs;

        } catch (error) {
            console.warn(`Error fetching programs for channel ${channelId}:`, error);
            return [];
        }
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
        // Convert to number for comparison since API might return strings
        const id = typeof channelId === 'string' ? parseInt(channelId, 10) : channelId;
        return this.channels.find(c => c.id === id || c.id === channelId);
    }

    navigateDate(days) {
        this.currentDate.setDate(this.currentDate.getDate() + days);
        this.cache.clear();
        this.currentEvents.clear();
        this.dailyPrograms.clear();
    }

    goToToday() {
        this.currentDate = new Date();
        this.cache.clear();
        this.currentEvents.clear();
        this.dailyPrograms.clear();
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
}