import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, SafeAreaView, StyleSheet, View } from 'react-native';
import { OutlineView } from './src/components/OutlineView';
import { ProjectSidebar } from './src/components/ProjectSidebar';
import { TabBar } from './src/components/TabBar';
import { TaskDetails } from './src/components/TaskDetails';
import { WorkspaceBar } from './src/components/WorkspaceBar';
import { DragProvider } from './src/components/DragContext';
import { useAutosave } from './src/hooks/useAutosave';
import { useAutoSync } from './src/hooks/useAutoSync';
import { useKeyboardNav } from './src/hooks/useKeyboardNav';
import { useStore } from './src/store/useStore';
import { color, themeCss } from './src/theme';

export default function App() {
  useKeyboardNav();
  useAutosave();
  useAutoSync();

  const themeMode = useStore((s) => s.themeMode);

  // Load the saved sync token and reopen the last workspace folder on startup.
  useEffect(() => {
    void useStore.getState().loadSecrets();
    void useStore.getState().restoreWorkspace();
  }, []);

  // Inject the theme palettes (CSS variables) once, and suppress the browser's
  // focus outline — the app draws its own selection ring.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent =
      themeCss() + '\n:focus, :focus-visible { outline: none !important; }';
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Apply the chosen theme as a data attribute on <html>; in `system` mode track
  // the OS preference live via matchMedia.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const rootEl = document.documentElement;
    const apply = (dark: boolean) => {
      if (dark) rootEl.dataset.theme = 'dark';
      else delete rootEl.dataset.theme;
    };
    if (themeMode === 'system') {
      const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
      apply(!!mq?.matches);
      const onChange = (e: MediaQueryListEvent) => apply(e.matches);
      mq?.addEventListener?.('change', onChange);
      return () => mq?.removeEventListener?.('change', onChange);
    }
    apply(themeMode === 'dark');
  }, [themeMode]);

  return (
    <SafeAreaView style={styles.app}>
      <View style={styles.body}>
        <ProjectSidebar />
        <DragProvider>
          <View style={styles.main}>
            <WorkspaceBar />
            <TabBar />
            <OutlineView />
          </View>
        </DragProvider>
        <TaskDetails />
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: color.appBg },
  body: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
});
