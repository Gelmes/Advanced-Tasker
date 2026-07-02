// Where the sync token lives at rest. In Electron we hand it to the main process,
// which encrypts it with the OS keychain (safeStorage / DPAPI on Windows) via the
// `atSecure` preload bridge. In a plain browser (or if the bridge is missing) we
// fall back to localStorage. The server URL is not secret and stays in localStorage.

interface SecureBridge {
  getToken: () => Promise<string>;
  setToken: (token: string) => Promise<void>;
}

const bridge = (globalThis as any).atSecure as SecureBridge | undefined;

/** True when the token is encrypted via the OS keychain (Electron), not plaintext. */
export const tokenIsEncrypted = !!bridge;

const TOKEN_LS_KEY = 'advanced-tasker:syncToken';

export async function getStoredToken(): Promise<string> {
  if (bridge) {
    try {
      return (await bridge.getToken()) ?? '';
    } catch {
      return '';
    }
  }
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_LS_KEY)) || '';
  } catch {
    return '';
  }
}

export async function storeToken(token: string): Promise<void> {
  if (bridge) {
    try {
      await bridge.setToken(token);
      return;
    } catch {
      // fall through to localStorage so the token isn't silently lost
    }
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_LS_KEY, token);
  } catch {
    // ignore storage failures
  }
}
