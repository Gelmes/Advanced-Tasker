// Running-timer notification (MOBILE.md Phase 4). A phone's lock screen is
// where you'd notice a timer you forgot to stop, which is the failure mode the
// desktop app can't help with.
//
// These are LOCAL notifications, which work in Expo Go (only push/remote needs
// a development build). Everything degrades silently: if the permission is
// denied or the platform refuses, timing still works exactly as before.
//
// The module is loaded LAZILY, on first use. Importing it in Expo Go logs a
// warning that Android *push* was removed from Expo Go in SDK 53 — irrelevant
// to local notifications, but alarming at app start. Deferring the import keeps
// it off the boot path (and out of the way entirely if you never run a timer).

import { Platform } from 'react-native';
import { readPrefs, writePrefs } from './cache';

type NotificationsModule = typeof import('expo-notifications');

let modulePromise: Promise<NotificationsModule | null> | null = null;

function loadNotifications(): Promise<NotificationsModule | null> {
  if (!modulePromise) {
    modulePromise = import('expo-notifications').catch(() => null);
  }
  return modulePromise;
}

const CHANNEL_ID = 'timer';
/** Stable id so the running-timer notice can be replaced/dismissed. */
const TIMER_NOTIFICATION_ID = 'advanced-tasker-timer';

let permission: boolean | null = null;

/** Ask once per app run; remember the answer. Never throws. */
async function ensurePermission(N: NotificationsModule): Promise<boolean> {
  if (permission !== null) return permission;
  try {
    const current = await N.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      granted = (await N.requestPermissionsAsync()).granted;
    }
    if (granted && Platform.OS === 'android') {
      // Android needs a channel before anything will post.
      await N.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Running timers',
        importance: N.AndroidImportance.LOW, // silent — it's a status, not an alert
        sound: null,
        vibrationPattern: null,
        enableVibrate: false,
      });
    }
    permission = granted;
  } catch {
    permission = false;
  }
  return permission;
}

/** Post (or replace) the "timer running" notice for `taskName`. */
export async function showTimerNotification(taskName: string, startedAt: string): Promise<void> {
  const N = await loadNotifications();
  if (!N || !(await ensurePermission(N))) return;
  const started = Date.parse(startedAt);
  const when = Number.isFinite(started)
    ? new Date(started).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null;
  try {
    await N.scheduleNotificationAsync({
      identifier: TIMER_NOTIFICATION_ID,
      content: {
        title: '⏱ Timer running',
        body: when ? `${taskName} — since ${when}` : taskName,
        // Ongoing on Android: the user can't swipe it away while it's true,
        // which is the point — it's a live status, not a notice.
        sticky: true,
        autoDismiss: false,
        sound: false,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null, // deliver now
    });
    writePrefs({ timerNoticePosted: true });
  } catch {
    // Non-fatal: the timer itself is unaffected.
  }
}

/** Remove the running-timer notice, if any. */
export async function clearTimerNotification(): Promise<void> {
  // Don't load the module just to clear nothing — this runs on every boot. The
  // persisted flag still catches a notice left behind by a killed app, which is
  // the one case where nothing is loaded but something IS posted.
  if (!modulePromise && !readPrefs().timerNoticePosted) return;
  const N = await loadNotifications();
  if (!N) return;
  try {
    await N.dismissNotificationAsync(TIMER_NOTIFICATION_ID);
    await N.cancelScheduledNotificationAsync(TIMER_NOTIFICATION_ID);
  } catch {
    // nothing posted / not permitted — fine either way
  } finally {
    writePrefs({ timerNoticePosted: false });
  }
}
