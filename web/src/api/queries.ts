import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  fetchChanges,
  fetchGroups,
  fetchBuildings,
  fetchAuditoryMap,
  fetchGroupSubgroups,
  fetchHealth,
  fetchNotificationSettings,
  fetchTutor,
  fetchAuditory,
  fetchWeek,
  search,
} from './client';
import type {
  BFFResponse,
  AuditoryMap,
  BuildingInfo,
  ChangesPage,
  Day,
  Group,
  GroupedSearchResult,
  HealthStatus,
  ScheduleChange,
  SearchResult,
  Subscription,
} from './types';

export const queryKeys = {
  groups: ['groups'] as const,
  week: (type: string, id: number, weekStart: string) => ['week', type, id, weekStart] as const,
  search: (q: string) => ['search', q] as const,
  changes: (type: string, id: number, subgroup: string) => ['changes', type, id, subgroup] as const,
  health: ['health'] as const,
  settings: (token: string, type: string, id: number) => ['settings', token, type, id] as const,
};

export function useGroups() {
  return useQuery<Group[]>({
    queryKey: queryKeys.groups,
    queryFn: fetchGroups,
    staleTime: 12 * 60 * 60 * 1000,
  });
}

export function useGroupName(groupId: number | null, savedName?: string) {
  const groups = useGroups();
  if (savedName) return savedName;
  const group = groups.data?.find((item) => item.id === groupId);
  return group?.name || (groupId ? `Группа ${groupId}` : '');
}

export function useGroupSubgroups(groupId: number | null) {
  return useQuery<string[]>({
    queryKey: ['subgroups', groupId || 0],
    queryFn: () => fetchGroupSubgroups(groupId!),
    enabled: Boolean(groupId),
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
}

export function useEntityInfo(type: 'tutor' | 'auditory', id: number | null) {
  return useQuery({
    queryKey: ['entity-info', type, id || 0],
    queryFn: () => (type === 'tutor' ? fetchTutor(id!) : fetchAuditory(id!)),
    enabled: Boolean(id),
    staleTime: 12 * 60 * 60 * 1000,
  });
}

export function useWeekSchedule(
  type: 'group' | 'tutor' | 'auditory',
  id: number | null,
  weekStart: string,
  enabled = true,
) {
  return useQuery<Day[]>({
    queryKey: queryKeys.week(type, id || 0, weekStart),
    queryFn: () => fetchWeek(type, id!, weekStart),
    enabled: Boolean(id) && enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useSearch(query: string) {
  return useQuery<SearchResult[] | GroupedSearchResult>({
    queryKey: queryKeys.search(query),
    queryFn: () => search(query, 'all'),
    enabled: query.trim().length >= 2,
    staleTime: 30 * 1000,
    retry: 0,
  });
}

export function useBuildings() {
  return useQuery<{ buildings: BuildingInfo[] }>({
    queryKey: ['buildings'],
    queryFn: fetchBuildings,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export function useAuditoryMap(building: string, date: string) {
  return useQuery<AuditoryMap>({
    queryKey: ['auditory-map', building, date],
    queryFn: () => fetchAuditoryMap(building, date),
    enabled: Boolean(building && date),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useChangesInfinite(
  type: 'group' | 'tutor' | 'auditory',
  id: number | null,
  subgroup: string,
  scope: 'group' | 'all' = 'group',
) {
  return useInfiniteQuery<ChangesPage>({
    queryKey: [...queryKeys.changes(type, id || 0, subgroup), scope],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      fetchChanges({
        entity_type: scope === 'all' ? undefined : type,
        entity_id: scope === 'all' ? undefined : id || undefined,
        subgroup: scope === 'all' ? undefined : subgroup || undefined,
        limit: 20,
        before_id: pageParam as number | undefined,
        scope: scope === 'all' ? 'all' : undefined,
        since: scope === 'group' ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.next_before_id || undefined,
    enabled: Boolean(id) || scope === 'all',
    staleTime: 60 * 1000,
  });
}

export function useRecentChanges(
  type: 'group' | 'tutor' | 'auditory',
  id: number | null,
  subgroup = '',
) {
  return useQuery<ScheduleChange[]>({
    queryKey: ['recent-changes', type, id || 0, subgroup],
    queryFn: async () => {
      const page = await fetchChanges({
        entity_type: type,
        entity_id: id || undefined,
        limit: 50,
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      return page.items.filter((item) => !subgroup || !item.subgroup || item.subgroup === subgroup);
    },
    enabled: Boolean(id),
    staleTime: 60 * 1000,
  });
}

export function useHealth() {
  return useQuery<HealthStatus>({
    queryKey: queryKeys.health,
    queryFn: fetchHealth,
    staleTime: 30 * 1000,
    retry: 0,
  });
}

export function useNotificationSettings(
  token: string | null,
  type: 'group' | 'tutor' | 'auditory',
  id: number | null,
) {
  return useQuery<Subscription | null>({
    queryKey: queryKeys.settings(token || '', type, id || 0),
    queryFn: () => fetchNotificationSettings(token!, type, id!),
    enabled: Boolean(token && id),
    retry: 0,
  });
}

// Re-export the response type for consumers that annotate query data.
export type { BFFResponse };
