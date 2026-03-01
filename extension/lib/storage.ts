import { DEFAULT_PREFERENCES, type UserPreferences } from "./types";

/** Get user preferences from chrome.storage.sync */
export async function getPreferences(): Promise<UserPreferences> {
  const result = await chrome.storage.sync.get("preferences");
  const stored = result.preferences ?? {};
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    sections: { ...DEFAULT_PREFERENCES.sections, ...stored.sections },
    chartHeights: { ...DEFAULT_PREFERENCES.chartHeights, ...stored.chartHeights },
  };
}

/** Update user preferences in chrome.storage.sync */
export async function setPreferences(
  updates: Partial<UserPreferences>
): Promise<UserPreferences> {
  const current = await getPreferences();
  const updated = { ...current, ...updates };
  await chrome.storage.sync.set({ preferences: updated });
  return updated;
}

/** Cache an API response with TTL in chrome.storage.local */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.local.get(key);
  const entry = result[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return entry.data as T;
}

/** Store a value in cache with TTL (in milliseconds) */
export async function cacheSet<T>(
  key: string,
  data: T,
  ttlMs: number
): Promise<void> {
  await chrome.storage.local.set({
    [key]: {
      data,
      expiresAt: Date.now() + ttlMs,
    },
  });
}
