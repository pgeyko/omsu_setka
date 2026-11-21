import axios from 'axios';
import type {
  BFFResponse,
  ChangesPage,
  Day,
  Group,
  GroupedSearchResult,
  HealthStatus,
  ScheduleChange,
  SearchResult,
  Subscription,
  Auditory,
  AuditoryMap,
  BuildingInfo,
  Tutor,
} from './types';

export const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';
export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || API_BASE;

export const readClient = axios.create({ baseURL: API_BASE, timeout: 10_000 });
export const writeClient = axios.create({ baseURL: API_ORIGIN, timeout: 10_000 });

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { error?: string; message?: string } | undefined;
    return payload?.error || payload?.message || error.message;
  }
  return 'Не удалось выполнить запрос';
}

export { errorMessage };

const unwrap = <T,>(response: { data: BFFResponse<T> }): T => response.data.data;

export async function search(query: string, type: string): Promise<SearchResult[] | GroupedSearchResult> {
  const response = await readClient.get<BFFResponse<SearchResult[] | GroupedSearchResult>>('/search', {
    params: { q: query, type, limit: 50 },
  });
  return unwrap(response);
}

export async function fetchGroups(): Promise<Group[]> {
  return unwrap(await readClient.get<BFFResponse<Group[]>>('/groups'));
}

export async function fetchBuildings(): Promise<{ buildings: BuildingInfo[] }> {
  return unwrap(await readClient.get<BFFResponse<{ buildings: BuildingInfo[] }>>('/auditories/buildings'));
}

export async function fetchAuditoryMap(building: string, date: string): Promise<AuditoryMap> {
  return unwrap(
    await readClient.get<BFFResponse<AuditoryMap>>('/auditories/map', {
      params: { building, date },
    }),
  );
}

export async function fetchTutors(): Promise<Tutor[]> {
  return unwrap(await readClient.get<BFFResponse<Tutor[]>>('/tutors'));
}

export async function fetchAuditories(): Promise<Auditory[]> {
  return unwrap(await readClient.get<BFFResponse<Auditory[]>>('/auditories'));
}

export async function fetchTutor(id: number): Promise<Tutor> {
  return unwrap(await readClient.get<BFFResponse<Tutor>>(`/tutors/${id}`));
}

export async function fetchAuditory(id: number): Promise<Auditory> {
  return unwrap(await readClient.get<BFFResponse<Auditory>>(`/auditories/${id}`));
}

export async function fetchGroupSubgroups(id: number): Promise<string[]> {
  return unwrap(await readClient.get<BFFResponse<string[]>>(`/schedule/group/${id}/subgroups`));
}

export async function fetchWeek(
  type: 'group' | 'tutor' | 'auditory',
  id: number,
  weekStart: string,
): Promise<Day[]> {
  const response = await readClient.get<BFFResponse<Day[]>>(`/schedule/${type}/${id}`, {
    params: { week_start: weekStart },
  });
  return unwrap(response);
}

export async function fetchScheduleDay(
  type: 'group' | 'tutor' | 'auditory',
  id: number,
  date: string,
): Promise<Day[]> {
  return unwrap(
    await readClient.get<BFFResponse<Day[]>>(`/schedule/${type}/${id}/day`, { params: { date } }),
  );
}

export interface ChangesParams {
  entity_type?: 'group' | 'tutor' | 'auditory';
  entity_id?: number;
  subgroup?: string;
  limit?: number;
  before_id?: number;
  since?: string;
  scope?: 'all';
}

export async function fetchChanges(params: ChangesParams): Promise<ChangesPage> {
  return unwrap(await readClient.get<BFFResponse<ChangesPage>>('/changes', { params }));
}

export async function fetchLegacyChanges(
  type: 'group' | 'tutor' | 'auditory',
  id: number,
): Promise<ScheduleChange[]> {
  return unwrap(await readClient.get<BFFResponse<ScheduleChange[]>>(`/changes/${type}/${id}`));
}

export async function fetchNotificationSettings(
  token: string,
  type: 'group' | 'tutor' | 'auditory',
  id: number,
): Promise<Subscription | null> {
  try {
    const response = await readClient.get<Subscription>(`/notifications/settings/${type}/${id}`, {
      headers: { 'X-FCM-Token': token },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
}

export async function patchNotificationSettings(
  token: string,
  type: 'group' | 'tutor' | 'auditory',
  id: number,
  patch: Partial<Omit<Subscription, 'fcm_token' | 'entity_type' | 'entity_id'>>,
): Promise<void> {
  await writeClient.patch('/notifications/settings', {
    fcm_token: token,
    entity_type: type,
    entity_id: id,
    ...patch,
  });
}

export interface SubscribeOptions {
  notify_on_change?: boolean;
  notify_daily_digest?: boolean;
  digest_time?: string;
  notify_before_lesson?: boolean;
  before_minutes?: number;
  timezone?: string;
}

export async function subscribe(
  token: string,
  type: 'group' | 'tutor' | 'auditory',
  id: number,
  subgroup: string,
  options: SubscribeOptions = {},
): Promise<void> {
  await writeClient.post('/subscribe', {
    fcm_token: token,
    entity_type: type,
    entity_id: id,
    subgroup,
    notify_on_change: true,
    notify_daily_digest: true,
    digest_time: '19:00',
    ...options,
  });
}

export async function unsubscribe(token: string, type: 'group' | 'tutor' | 'auditory', id: number): Promise<void> {
  await writeClient.post('/unsubscribe', {
    fcm_token: token,
    entity_type: type,
    entity_id: id,
  });
}

export async function fetchSubscriptions(token: string): Promise<Subscription[]> {
  return unwrap(
    await readClient.get<BFFResponse<Subscription[]>>('/subscriptions', {
      headers: { 'X-FCM-Token': token },
    }),
  );
}

export async function fetchHealth(): Promise<HealthStatus> {
  return unwrap(await readClient.get<BFFResponse<HealthStatus>>('/health'));
}
