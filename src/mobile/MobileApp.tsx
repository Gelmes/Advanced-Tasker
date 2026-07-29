// Mobile shell (MOBILE.md). A three-screen back-stack — Projects → Outline,
// plus Sync settings — over the shared store. Deliberately no navigation
// library: v1 has three screens and a linear stack; revisit if that grows.

import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, SafeAreaView, StyleSheet } from 'react-native';
import { hydrateSyncConfig } from './secrets';
import { openMobileProject, useMobileAutoSync, useMobileCacheAutosave } from './sync';
import { OutlineScreen } from './screens/OutlineScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { MobileThemeProvider, useTheme } from './theme';

type Screen = 'projects' | 'outline' | 'settings';

function Shell() {
  const { name, palette } = useTheme();
  const [screen, setScreen] = useState<Screen>('projects');
  const [openId, setOpenId] = useState<string | null>(null);
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

  return (
    <SafeAreaView style={[styles.app, { backgroundColor: palette.appBg }]}>
      {ready && screen === 'projects' && (
        <ProjectsScreen
          onOpen={async (id) => {
            await openMobileProject(id);
            setOpenId(id);
            setScreen('outline');
          }}
          onSettings={() => setScreen('settings')}
        />
      )}
      {ready && screen === 'outline' && (
        <OutlineScreen onBack={() => setScreen('projects')} />
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
    <MobileThemeProvider>
      <Shell />
    </MobileThemeProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
});
