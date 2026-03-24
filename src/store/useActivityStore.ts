// src/store/useActivityStore.ts
import { create } from 'zustand';

interface Activity {
  id: string;
  type: 'MINT' | 'TRADE';
  from: string;
  to?: string;
  tokenId: string;
  timestamp: number;
}

interface ActivityState {
  activities: Activity[];
  addActivity: (activity: Activity) => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  activities: [],
  addActivity: (activity) => 
    set((state) => ({ 
      activities: [activity, ...state.activities].slice(0, 50) // Keep last 50
    })),
}));