import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SubscriptionItem {
  id: number;
  type: string;
  name: string;
  token: string;
}

interface SubscriptionsState {
  subscriptions: SubscriptionItem[];
  addSubscription: (item: SubscriptionItem) => void;
  removeSubscription: (id: number, type: string) => void;
  isSubscribed: (id: number, type: string) => boolean;
  getToken: (id: number, type: string) => string | undefined;
}

export const useSubscriptionsStore = create<SubscriptionsState>()(
  persist(
    (set, get) => ({
      subscriptions: [],
      addSubscription: (item) => set((state) => ({
        subscriptions: [
          ...state.subscriptions.filter(s => !(s.id === item.id && s.type === item.type)),
          item
        ]
      })),
      removeSubscription: (id, type) => set((state) => ({
        subscriptions: state.subscriptions.filter(s => !(s.id === id && s.type === type))
      })),
      isSubscribed: (id, type) => get().subscriptions.some(s => s.id === id && s.type === type),
      getToken: (id, type) => get().subscriptions.find(s => s.id === id && s.type === type)?.token,
    }),
    {
      name: 'omsu-setka-subscriptions',
    }
  )
);
