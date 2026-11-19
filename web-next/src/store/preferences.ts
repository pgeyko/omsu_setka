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

const storedTheme = (() => {
  try {
    const value = localStorage.getItem('setka-theme');
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
})();

const storedGroup = (() => {
  try {
    const id = Number(localStorage.getItem('setka-group'));
    const name = localStorage.getItem('setka-group-name') || '';
    return Number.isFinite(id) && id > 0 ? { id, name } : null;
  } catch {
    return null;
  }
})();

const storedSubgroup = (() => {
  try {
    return localStorage.getItem('setka-subgroup') || '';
  } catch {
    return '';
  }
})();

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      group: storedGroup,
      subgroup: storedSubgroup,
      theme: storedTheme,
      favorites: storedGroup ? [storedGroup] : [],
      recent: storedGroup ? [storedGroup] : [],
      recentEntities: [],
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
