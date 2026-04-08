import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SearchResult } from '../api/client';

interface FavoritesState {
  favorites: SearchResult[];
  addFavorite: (item: SearchResult) => void;
  removeFavorite: (id: number, type: string) => void;
  isFavorite: (id: number, type: string) => boolean;
  recent: SearchResult[];
  recentTutors: SearchResult[];
  recentAuditories: SearchResult[];
  addRecent: (item: SearchResult) => void;
  subgroup: string | null;
  setSubgroup: (subgroup: string | null) => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      addFavorite: (item) => set((state) => ({
        favorites: [...state.favorites.filter(f => !(f.id === item.id && f.type === item.type)), item]
      })),
      removeFavorite: (id, type) => set((state) => ({
        favorites: state.favorites.filter(f => !(f.id === id && f.type === type))
      })),
      isFavorite: (id, type) => get().favorites.some(f => f.id === id && f.type === type),
      recent: [],
      recentTutors: [],
      recentAuditories: [],
      addRecent: (item) => set((state) => {
        if (item.type === 'group') {
          return {
            recent: [item, ...state.recent.filter(r => !(r.id === item.id && r.type === item.type))].slice(0, 5)
          };
        } else if (item.type === 'tutor') {
          return {
            recentTutors: [item, ...state.recentTutors.filter(r => !(r.id === item.id && r.type === item.type))].slice(0, 5)
          };
        } else if (item.type === 'auditory') {
          return {
            recentAuditories: [item, ...state.recentAuditories.filter(r => !(r.id === item.id && r.type === item.type))].slice(0, 5)
          };
        }
        return state;
      }),
      subgroup: null,
      setSubgroup: (subgroup) => set({ subgroup }),
    }),
    {
      name: 'omsu-mirror-favorites',
    }
  )
);
