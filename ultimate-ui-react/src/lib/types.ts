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
  directors?: string;
  actors?: string;
  image_url?: string;
  icon_url?: string;
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
