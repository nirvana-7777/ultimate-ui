export interface CatchupInfo {
  enabled: boolean;
  hours: number;
}

export interface Channel {
  id: string | number;
  display_name: string;
  name: string;
  icon_url?: string;
  streamUrl?: string;
  provider?: string;
  catchup?: CatchupInfo;
  Id?: string | number;
  Name?: string;
  LogoUrl?: string;
  StreamUrl?: string;
}

export interface Program {
  id?: number | string;
  program_id?: number | string;
  channel_id: string | number;
  title: string;
  subtitle?: string;
  description?: string;
  start_time: string;
  end_time: string;
  start_time_local?: string;
  end_time_local?: string;
  date_local?: string;
  duration?: number;
  category?: string;
  rating?: string;
  episode_formatted?: string | null;
  directors?: string | string[];
  actors?: string | string[];
  image_url?: string;
  icon_url?: string;
  thumbnail_url?: string;
  /** Raw DVB content code (0x10 ... 0xE0), 0/undefined = unknown. */
  genre?: number | string;
  genre_dvb?: number | string;
  /** Plain 1-based numbers, or an XMLTV-NS string ("0.4.") in episode_num. */
  season_num?: number | string | null;
  episode_num?: number | string | null;
  year?: number | string;
  production_year?: number | string;
  language?: string;
  presenters?: string | string[];
  producers?: string | string[];
  writers?: string | string[];
  country?: string;
  ultimate_epg_id?: string | number;
  /** Provider's own event id (e.g. "pro7_sd_0334511e"). The one timers need (create/update/delete). */
  epg_event_id?: string;
  /** Aliases used by /api/v1/providers/<p>/channels/<c>/epg. */
  plot?: string;
  episode_name?: string;
  episode_number?: number | string;
  season_number?: number | string;
  icon?: string;
  stream_url?: string;
  stream?: string;
  is_live?: boolean;
  is_past?: boolean;
  progress?: {
    percentage: number;
    duration: number;
    elapsed: number;
    remaining: number;
  };
  time_remaining?: string;
  time_badge?: {
    type: 'live' | 'today' | 'yesterday' | 'tomorrow' | 'past' | 'future';
    text: string;
    timeRange: string;
    class: string;
  };
}

export interface Provider {
  id: number;
  name: string;
  label?: string;
  xmltv_url?: string;
  enabled: boolean;
}

export interface ImportLog {
  id: number;
  provider_id: number;
  status: 'success' | 'failed' | 'running';
  started_at: string;
  completed_at?: string;
  programs_imported?: number;
  programs_skipped?: number;
}

export interface MonitoringData {
  config: any;
  webepg_health: boolean;
  statistics: any;
  import_status: any;
  config_path: string;
  error: string | null;
}

export type EPGErrorKind = 'channels' | 'programs' | 'pagination';

export interface EPGError {
  kind: EPGErrorKind;
  message: string;
}
