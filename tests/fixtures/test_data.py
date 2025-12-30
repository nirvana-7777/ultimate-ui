"""
Test data fixtures for unit tests.
"""

sample_channels = [
    {
        "id": "channel1",
        "name": "ARD",
        "display_name": "Das Erste",
        "icon_url": "http://example.com/ard.png",
        "language": "de",
        "country": "DE",
    },
    {
        "id": "channel2",
        "name": "ZDF",
        "display_name": "ZDF",
        "icon_url": "http://example.com/zdf.png",
        "language": "de",
        "country": "DE",
    },
    {
        "id": "channel3",
        "name": "RTL",
        "display_name": "RTL Television",
        "icon_url": "http://example.com/rtl.png",
        "language": "de",
        "country": "DE",
    },
]

sample_programs = [
    {
        "id": "program1",
        "title": "Tagesschau",
        "subtitle": "20:00 Uhr",
        "description": "Die wichtigsten Nachrichten des Tages aus dem In- und Ausland.",
        "start_time": "2024-01-01T20:00:00Z",
        "end_time": "2024-01-01T20:15:00Z",
        "category": "news",
        "channel_id": "channel1",
        "stream": "http://example.com/stream1.m3u8",
    },
    {
        "id": "program2",
        "title": "Sportschau",
        "subtitle": "Bundesliga Highlights",
        "description": "Zusammenfassungen der Bundesliga-Spiele vom Wochenende.",
        "start_time": "2024-01-01T20:15:00Z",
        "end_time": "2024-01-01T21:00:00Z",
        "category": "sport",
        "channel_id": "channel1",
        "stream": "http://example.com/stream2.m3u8",
    },
    {
        "id": "program3",
        "title": "Heute Journal",
        "subtitle": "Das Nachrichtenmagazin",
        "description": "Hintergrundberichte und Analysen zu aktuellen Themen.",
        "start_time": "2024-01-01T21:00:00Z",
        "end_time": "2024-01-01T21:45:00Z",
        "category": "news",
        "channel_id": "channel2",
        "stream": "http://example.com/stream3.m3u8",
    },
]

sample_providers = [
    {
        "id": "provider1",
        "name": "IPTV Provider Germany",
        "description": "German IPTV channels",
        "country": "DE",
        "language": "de",
        "url": "http://provider1.com/epg.xml",
    },
    {
        "id": "provider2",
        "name": "International IPTV",
        "description": "International channels",
        "country": "US",
        "language": "en",
        "url": "http://provider2.com/epg.xml",
    },
]

sample_import_status = {
    "recent_imports": [
        {
            "id": "import1",
            "provider_id": "provider1",
            "started_at": "2024-01-01T10:00:00Z",
            "completed_at": "2024-01-01T10:05:30Z",
            "status": "success",
            "programs_imported": 1500,
            "programs_skipped": 50,
            "error_message": None,
        },
        {
            "id": "import2",
            "provider_id": "provider2",
            "started_at": "2024-01-01T11:00:00Z",
            "completed_at": "2024-01-01T11:10:15Z",
            "status": "failed",
            "programs_imported": 0,
            "programs_skipped": 0,
            "error_message": "Connection timeout",
        },
    ],
    "next_scheduled_import": "2024-01-02T02:00:00Z",
    "import_interval_hours": 24,
}

sample_statistics = {
    "total_channels": 150,
    "total_programs": 25000,
    "total_providers": 5,
    "total_aliases": 45,
    "earliest_program": "2023-12-25T00:00:00Z",
    "latest_program": "2024-01-07T23:59:59Z",
    "days_covered": 14,
    "channels_by_country": {"DE": 80, "US": 40, "GB": 30},
    "programs_by_category": {
        "news": 5000,
        "sport": 3000,
        "movie": 4000,
        "series": 6000,
        "other": 7000,
    },
}
