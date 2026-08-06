/**
 * Storage Adapter for Supabase Auth
 *
 * Storage adapter compatible with Supabase Auth
 * Supabase expects: getItem, setItem, removeItem (can be async)
 */

export const nativeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    return localStorage.getItem(key);
  },

  setItem: async (key: string, value: string): Promise<void> => {
    localStorage.setItem(key, value);
  },

  removeItem: async (key: string): Promise<void> => {
    localStorage.removeItem(key);
  },
};
