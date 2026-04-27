import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

export interface BFFResponse<T> {
  success: boolean;
  data: T;
  cached_at: string;
  source: 'cache' | 'upstream' | 'stale';
  week_start?: string;
  week_end?: string;
  has_prev: boolean;
  has_next: boolean;
}

export interface Group {
  id: number;
  real_group_id: string;
  faculty_id: number;
  label: string;
}

export interface Tutor {
  id: number;
  name: string;
}

export interface Auditory {
  id: number;
  name: string;
}

export interface Lesson {
  id: number;
  time: number;
  faculty: string;
  lesson: string;
  type_work: string;
  teacher: string;
  group: string;
  auditCorps: string;
  publishDate: string;
  subgroupName?: string;
}

export interface Day {
  day: string;
  lessons: Lesson[];
}

export const TIME_SLOTS: Record<number, { start: string; end: string }> = {
  1: { start: '08.45', end: '10.20' },
  2: { start: '10.30', end: '12.05' },
  3: { start: '12.45', end: '14.20' },
  4: { start: '14.30', end: '16.05' },
  5: { start: '16.15', end: '17.50' },
  6: { start: '18.00', end: '19.35' },
  7: { start: '19.45', end: '21.20' },
  8: { start: '21.30', end: '23.05' },
};

export interface SearchResult {
  id: number;
  name: string;
  type: 'group' | 'tutor' | 'auditory';
  real_group_id?: number;
  building?: string;
}

export interface GroupedSearchResult {
  groups: SearchResult[];
  tutors: SearchResult[];
  auditories: SearchResult[];
}

export const fetchSearch = async (query: string, type: string = 'all'): Promise<SearchResult[] | GroupedSearchResult> => {
  const { data } = await apiClient.get<BFFResponse<SearchResult[] | GroupedSearchResult>>(`/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`);
  return data.data;
};

export const fetchSchedule = async (type: string, id: number, weekStart?: string): Promise<BFFResponse<Day[]>> => {
  const url = `/schedule/${type}/${id}${weekStart ? `?week_start=${weekStart}` : ''}`;
  const { data } = await apiClient.get<BFFResponse<Day[]>>(url);
  return data;
};

export const fetchScheduleDay = async (type: string, id: number, date: string): Promise<BFFResponse<Day[]>> => {
  const { data } = await apiClient.get<BFFResponse<Day[]>>(`/schedule/${type}/${id}/day?date=${date}`);
  return data;
};


export const fetchTutors = async (): Promise<Tutor[]> => {
  const { data } = await apiClient.get<BFFResponse<Tutor[]>>('/tutors');
  return data.data;
};

export const fetchHealth = async (): Promise<HealthData> => {
  const { data } = await apiClient.get<BFFResponse<HealthData>>('/health');
  return data.data;
};

export const onRateLimit = (callback: (retryAfter: string) => void) => {
  apiClient.interceptors.response.use(
    response => response,
    error => {
      if (error.response?.status === 429) {
        const retryAfter = error.response.data?.retry_after || '1m';
        callback(retryAfter);
      }
      return Promise.reject(error);
    }
  );
};

export interface UpstreamStatus {
  healthy: boolean;
  last_success?: string;
  last_fail?: string;
  last_error?: string;
  consecutive_failures: number;
  total_failures: number;
}

export interface HealthData {
  status: string;
  uptime: string;
  upstream: UpstreamStatus;
  last_sync: {
    dictionaries: string;
    schedules: string;
  };
  cache: {
    hits: number;
    misses: number;
    item_count: number;
  };
}

export interface Incident {
  id: number;
  event_type: 'down' | 'up' | 'error' | 'slow';
  message: string;
  error_text?: string;
  created_at: string;
}

export interface NotificationSettings {
  notify_on_change: boolean;
  notify_daily_digest: boolean;
  digest_time: string;
  timezone?: string;
  fcm_token?: string | null;
  entity_type?: string;
  entity_id?: number;
  subgroup?: string;
  notify_before_lesson?: boolean;
  before_minutes?: number;
}

export const fetchIncidents = async (limit: number = 50, offset: number = 0): Promise<Incident[]> => {
  const { data } = await apiClient.get<BFFResponse<Incident[]>>(`/incidents?limit=${limit}&offset=${offset}`);
  return data.data;
};

export const fetchChanges = async (type: string, id: number): Promise<unknown[]> => {
  const { data } = await apiClient.get<BFFResponse<unknown[]>>(`/changes/${type}/${id}`);
  return data.data;
};

export const subscribeToNotifications = async (token: string, type: string, id: number, subgroup?: string) => {
  const { data } = await apiClient.post('/subscribe', {
    fcm_token: token,
    entity_type: type,
    entity_id: id,
    notify_on_change: true,
    subgroup: subgroup || ""
  });
  return data;
};

export const unsubscribeFromNotifications = async (token: string, type: string, id: number) => {
  const { data } = await apiClient.post('/unsubscribe', {
    fcm_token: token,
    entity_type: type,
    entity_id: id,
  });
  return data;
};
export const getNotificationSettings = async (token: string, type: string, id: number): Promise<NotificationSettings> => {
  const { data } = await apiClient.get<NotificationSettings>(`/notifications/settings/${type}/${id}`, {
    headers: {
      'X-FCM-Token': token,
    },
  });
  return data;
};

export const updateNotificationSettings = async (settings: NotificationSettings) => {
  const { data } = await apiClient.patch('/notifications/settings', settings);
  return data;
};
