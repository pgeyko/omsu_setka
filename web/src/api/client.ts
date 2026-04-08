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
}

export interface Group {
  id: number;
  real_group_id: string;
  faculty_id: number;
  label: string;
}

export interface Tutor {
  id: number;
  label: string;
}

export interface Auditory {
  id: number;
  label: string;
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
  const { data } = await apiClient.get<BFFResponse<SearchResult[] | GroupedSearchResult>>(`/search?q=${query}&type=${type}`);
  return data.data;
};

export const fetchSchedule = async (type: string, id: number) => {
  const { data } = await apiClient.get<BFFResponse<Day[]>>(`/schedule/${type}/${id}`);
  return data.data;
};
