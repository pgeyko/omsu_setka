import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

export interface SavedGroup {
  id: number;
  name: string;
}

export interface RecentEntity {
  type: 'group' | 'tutor' | 'auditory';
  id: number;
  name: string;
}

interface PreferencesState {
  group: SavedGroup | null;
  subgroup: string;
  theme: Theme;
  favorites: SavedGroup[];
  recent: SavedGroup[];
  recentEntities: RecentEntity[];
  setGroup: (group: SavedGroup | null) => void;
  setSubgroup: (subgroup: string) => void;
  setTheme: (theme: Theme) => void;
  toggleFavorite: (group: SavedGroup) => void;
  addFavorite: (group: SavedGroup) => void;
  addRecent: (group: SavedGroup) => void;
  addRecentEntity: (entity: RecentEntity) => void;
}

interface LegacyEntity {
  id?: number | string;
  name?: string;
  type?: string;
  real_group_id?: number | string;
}

interface LegacyStore {
  state?: {
    favorites?: LegacyEntity[];
    recent?: LegacyEntity[];
    recentTutors?: LegacyEntity[];
    recentAuditories?: LegacyEntity[];
    subgroup?: string | null;
    pinnedEntity?: LegacyEntity | null;
  };
}

function readStore<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function legacyGroup(entity?: LegacyEntity | null): SavedGroup | null {
  if (!entity || entity.type !== 'group') return null;
  const id = Number(entity.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { id, name: entity.name || `Группа ${id}` };
}

function legacyEntity(entity?: LegacyEntity | null): RecentEntity | null {
  if (!entity) return null;
  const type = entity.type;
  if (type !== 'group' && type !== 'tutor' && type !== 'auditory') return null;
  const id = Number(entity.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { type, id, name: entity.name || `${id}` };
}

function uniqueGroups(items: Array<SavedGroup | null>): SavedGroup[] {
  const seen = new Set<number>();
  return items.filter((item): item is SavedGroup => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function uniqueEntities(items: Array<RecentEntity | null>): RecentEntity[] {
  const seen = new Set<string>();
  return items.filter((item): item is RecentEntity => {
    if (!item) return false;
    const key = `${item.type}-${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const legacy = readStore<LegacyStore>('omsu-setka-favorites')?.state;
const legacyPinned = legacyGroup(legacy?.pinnedEntity);
const legacyFavorites = uniqueGroups((legacy?.favorites || []).map(legacyGroup)).slice(0, 6);
const legacyRecent = uniqueGroups((legacy?.recent || []).map(legacyGroup)).slice(0, 5);
const legacyEntities = uniqueEntities([
  ...(legacy?.recentTutors || []).map((item) => ({ ...item, type: 'tutor' as const })),
  ...(legacy?.recentAuditories || []).map((item) => ({ ...item, type: 'auditory' as const })),
  ...(legacy?.recent || []),
].map(legacyEntity)).slice(0, 5);

const storedTheme = (() => {
  try {
    const value = localStorage.getItem('setka-theme');
    if (value === 'light' || value === 'dark' || value === 'system') return value;
    const legacyTheme = readStore<{ state?: { theme?: string } }>('omsu-setka-settings')?.state?.theme;
    if (legacyTheme === 'light' || legacyTheme === 'dark') return legacyTheme;
    return 'system';
  } catch {
    return 'system';
  }
})();

const storedGroup = (() => {
  try {
    const id = Number(localStorage.getItem('setka-group'));
    const name = localStorage.getItem('setka-group-name') || '';
    if (Number.isFinite(id) && id > 0) return { id, name };
    return legacyPinned;
  } catch {
    return legacyPinned;
  }
})();

const storedSubgroup = (() => {
  try {
    return localStorage.getItem('setka-subgroup') || legacy?.subgroup || '';
  } catch {
    return legacy?.subgroup || '';
  }
})();

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      group: storedGroup,
      subgroup: storedSubgroup,
      theme: storedTheme,
      favorites: uniqueGroups([storedGroup, ...legacyFavorites]),
      recent: uniqueGroups([storedGroup, ...legacyRecent]).slice(0, 5),
      recentEntities: legacyEntities,
      setGroup: (group) =>
        set(() => {
          try {
            if (group) {
              localStorage.setItem('setka-group', String(group.id));
              localStorage.setItem('setka-group-name', group.name);
            } else {
              localStorage.removeItem('setka-group');
              localStorage.removeItem('setka-group-name');
            }
          } catch {
            /* private mode */
          }
          return { group };
        }),
      setSubgroup: (subgroup) => {
        try {
          localStorage.setItem('setka-subgroup', subgroup);
        } catch {
          /* private mode */
        }
        set({ subgroup });
      },
      setTheme: (theme) => {
        try {
          localStorage.setItem('setka-theme', theme);
        } catch {
          /* private mode */
        }
        set({ theme });
      },
      toggleFavorite: (group) =>
        set((state) => ({
          favorites: state.favorites.some((item) => item.id === group.id)
            ? state.favorites.filter((item) => item.id !== group.id)
            : [...state.favorites, group],
        })),
      addFavorite: (group) =>
        set((state) => ({
          favorites: state.favorites.some((item) => item.id === group.id)
            ? state.favorites
            : [...state.favorites, group].slice(-6),
        })),
      addRecent: (group) =>
        set((state) => ({
          recent: [group, ...state.recent.filter((item) => item.id !== group.id)].slice(0, 5),
        })),
      addRecentEntity: (entity) =>
        set((state) => ({
          recentEntities: [
            entity,
            ...state.recentEntities.filter(
              (item) => !(item.type === entity.type && item.id === entity.id),
            ),
          ].slice(0, 5),
        })),
    }),
    {
      name: 'setka-preferences',
      partialize: (state) => ({
        group: state.group,
        subgroup: state.subgroup,
        theme: state.theme,
        favorites: state.favorites,
        recent: state.recent,
        recentEntities: state.recentEntities,
      }),
    },
  ),
);
