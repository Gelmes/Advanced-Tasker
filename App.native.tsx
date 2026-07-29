// Native (Android/iOS) entry. Metro resolves `./App` to this file on native
// platforms and to App.tsx on web, so the desktop app is untouched. Keep this
// file free of web-only imports (see the adapter table in MOBILE.md).

import { MobileApp } from './src/mobile/MobileApp';

export default function App() {
  return <MobileApp />;
}
