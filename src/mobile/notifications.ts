// Running-timer notification (MOBILE.md Phase 4). A phone's lock screen is
// where you'd notice a timer you forgot to stop, which is the failure mode the
// desktop app can't help with.
//
// These are LOCAL notifications, which work in Expo Go (only push/remote needs
// a development build). Everything degrades silently: if the permission is
// denied or the platform refuses, timing still works exactly as before.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'timer';
/** Stable id so the running-timer notice can be replaced/dismissed. */
const TIMER_NOTIFICATION_ID = 'advanced-tasker-timer';

let permission: boolean | null = null;

/** Ask once per app run; remember the answer. Never throws. */
async function ensurePermission(): Promise<boolean> {
  if (permission !== null) return permission;
  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (granted && Platform.OS === 'android') {
      // Android needs a channel before anything will post.
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Running timers',
        importance: Notifications.AndroidImportance.LOW, // silent — it's a status, not an alert
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
  if (!(await ensurePermission())) return;
  const started = Date.parse(startedAt);
  const when = Number.isFinite(started)
    ? new Date(started).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null;
  try {
    await Notifications.scheduleNotificationAsync({
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
  } catch {
    // Non-fatal: the timer itself is unaffected.
  }
}

/** Remove the running-timer notice, if any. */
export async function clearTimerNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(TIMER_NOTIFICATION_ID);
    await Notifications.cancelScheduledNotificationAsync(TIMER_NOTIFICATION_ID);
  } catch {
    // nothing posted / not permitted — fine either way
  }
}
