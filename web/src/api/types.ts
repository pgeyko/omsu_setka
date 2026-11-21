export interface BFFResponse<T> {
  success: boolean;
  data: T;
  cached_at: string;
  source: string;
  week_start?: string;
  week_end?: string;
  has_prev: boolean;
  has_next: boolean;
}

export interface Group {
  id: number;
  name: string;
  real_group_id?: number | null;
}

export interface Tutor {
  id: number;
  name: string;
}

export interface Auditory {
  id: number;
  name: string;
  building: string;
}

export interface Lesson {
  id: number;
  lesson_id?: number;
  time: number;
  faculty: string;
  lesson: string;
  type_work: string;
  teacher: string;
  teacher_id?: number;
  group: string;
  group_id?: number;
  auditCorps: string;
  auditory_id?: number;
  subgroupName?: string;
  subgroup_number?: string;
  building?: string;
  room?: string;
  publishDate: string;
}

export interface Day {
  day: string;
  date?: string;
  lessons: Lesson[];
}

export type EntityType = 'group' | 'tutor' | 'auditory';

export interface SearchResult {
  id: number;
  name: string;
  type: EntityType;
  real_group_id?: number;
  building?: string;
}

export interface BuildingInfo {
  building: string;
  rooms: number;
}

export interface AuditoryMapRoom {
  id: number;
  name: string;
  floor: number;
  busy: number[];
  free: boolean;
}

export interface AuditoryMap {
  building: string;
  date: string;
  updated_at?: string;
  ready: boolean;
  stale: boolean;
  rooms: AuditoryMapRoom[];
}

export interface GroupedSearchResult {
  groups: SearchResult[];
  tutors: SearchResult[];
  auditories: SearchResult[];
}

export interface FieldChange {
  field: string;
  label: string;
  old: string;
  new: string;
}

export interface ScheduleChange {
  id: number;
  entity_type: EntityType;
  entity_id: number;
  change_type: 'added' | 'removed' | 'modified';
  lesson_id: number;
  day?: string;
  pair?: number;
  subgroup?: string;
  subject?: string;
  changes?: FieldChange[];
  old_data?: string;
  new_data?: string;
  created_at: string;
}

export interface ChangesPage {
  items: ScheduleChange[];
  next_before_id: number;
}

export interface Subscription {
  fcm_token: string;
  entity_type: EntityType;
  entity_id: number;
  notify_on_change: boolean;
  notify_daily_digest: boolean;
  digest_time: string;
  notify_before_lesson: boolean;
  before_minutes: number;
  timezone: string;
  subgroup: string;
  last_digest_at?: string;
  last_reminder_at?: string;
}

export interface HealthStatus {
  status: string;
  uptime: string;
  upstream: {
    healthy: boolean;
    last_success?: string;
    last_fail?: string;
    last_error?: string;
    consecutive_failures: number;
    total_failures: number;
  };
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
