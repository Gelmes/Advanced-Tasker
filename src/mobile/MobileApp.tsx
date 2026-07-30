// Mobile shell (MOBILE.md). A three-screen back-stack — Projects → Outline,
// plus Sync settings — over the shared store. Deliberately no navigation
// library: v1 has three screens and a linear stack; revisit if that grows.

import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet } from 'react-native';
// RN's own SafeAreaView is iOS-only — on Android the header renders under the
// status-bar icons without this package's inset handling.
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { findNode } from '../model/tree';
import { useStore } from '../store/useStore';
import { hydrateSyncConfig } from './secrets';
import { readPrefs, writePrefs } from './cache';
import { clearTimerNotification, showTimerNotification } from './notifications';
import { openMobileProject, useMobileAutoSync, useMobileCacheAutosave } from './sync';
import { OutlineScreen } from './screens/OutlineScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { MobileThemeProvider, useTheme } from './theme';

type Screen = 'projects' | 'outline' | 'settings';

/**
 * Mirror the running timer into a notification (MOBILE.md Phase 4) — a phone's
 * lock screen is where you'd catch a timer you forgot to stop. Keyed on the
 * timer id alone so ordinary edits don't re-post it; the node is read fresh
 * when it does fire. Also reconciles on boot: no timer → clear any notice left
 * over from a previous run.
 */
function useTimerNotification() {
  const activeTimerId = useStore((s) => s.project.activeTimerNodeId);
  useEffect(() => {
    if (!activeTimerId) {
      void clearTimerNotification();
      return;
    }
    const { project } = useStore.getState();
    const node = findNode(project.root.children, activeTimerId);
    if (!node?.time.startedAt) {
      void clearTimerNotification();
      return;
    }
    void showTimerNotification(node.content || 'Untitled task', node.time.startedAt);
  }, [activeTimerId]);
}

function Shell() {
  const { name, palette } = useTheme();
  const [screen, setScreen] = useState<Screen>('projects');
  const [openId, setOpenId] = useState<string | null>(null);
  const [captureOnOpen, setCaptureOnOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // Boot: load the sync config from the keystore into the store; land on
  // settings when unconfigured (the first-run experience).
  useEffect(() => {
    void hydrateSyncConfig().then((configured) => {
      if (!configured) setScreen('settings');
      setReady(true);
    });
  }, []);

  // The mobile sync rhythm + cache autosave run for whichever project is open.
  useMobileAutoSync(openId);
  useMobileCacheAutosave(openId);
  useTimerNotification();

  // Android hardware/gesture back pops to Projects before leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen !== 'projects') {
        setScreen('projects');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  const open = async (id: string, capture = false) => {
    await openMobileProject(id);
    writePrefs({ lastProjectId: id });
    setOpenId(id);
    setCaptureOnOpen(capture);
    setScreen('outline');
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.app, { backgroundColor: palette.appBg }]}
    >
      {ready && screen === 'projects' && (
        <ProjectsScreen
          onOpen={(id) => open(id)}
          onCapture={() => {
            const last = readPrefs().lastProjectId;
            if (last) void open(last, true).catch(() => {});
          }}
          onSettings={() => setScreen('settings')}
        />
      )}
      {ready && screen === 'outline' && (
        <OutlineScreen
          onBack={() => setScreen('projects')}
          initialCapture={captureOnOpen}
        />
      )}
      {ready && screen === 'settings' && (
        <SettingsScreen onBack={() => setScreen('projects')} />
      )}
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
    </SafeAreaView>
  );
}

export function MobileApp() {
  return (
    <SafeAreaProvider>
      <MobileThemeProvider>
        <Shell />
      </MobileThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
});
