// Mobile sync-config storage (MOBILE.md adapter table). The desktop keeps the
// token in the OS keychain via Electron and the URL in localStorage; on native
// both live in expo-secure-store (hardware-backed keystore on Android). The
// desktop's secretStore paths no-op gracefully on native, so mobile hydrates
// the store itself on boot instead of using loadSecrets().

import * as SecureStore from 'expo-secure-store';
import { useStore } from '../store/useStore';

const URL_KEY = 'at.syncUrl';
const TOKEN_KEY = 'at.syncToken';

export async function loadSyncConfig(): Promise<{ url: string; token: string }> {
  try {
    const [url, token] = await Promise.all([
      SecureStore.getItemAsync(URL_KEY),
      SecureStore.getItemAsync(TOKEN_KEY),
    ]);
    return { url: url ?? '', token: token ?? '' };
  } catch {
    return { url: '', token: '' };
  }
}

export async function saveSyncConfig(url: string, token: string): Promise<void> {
  await SecureStore.setItemAsync(URL_KEY, url.trim());
  await SecureStore.setItemAsync(TOKEN_KEY, token.trim());
  useStore.setState({ syncUrl: url.trim(), syncToken: token.trim() });
}

/** Load the persisted config into the store on boot. True when fully configured. */
export async function hydrateSyncConfig(): Promise<boolean> {
  const { url, token } = await loadSyncConfig();
  if (url || token) useStore.setState({ syncUrl: url, syncToken: token });
  return !!(url && token);
}
