import type { CSSProperties, ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

// A small anchored popup menu, used for right-click context menus (sidebar rows,
// tabs) and the toolbar File menu. Rendered in a transparent Modal so a click
// anywhere else dismisses it. Position is viewport coordinates (e.g. from a DOM
// contextmenu event or measureInWindow), clamped so the menu stays on screen.

export interface MenuItem {
  label: string;
  /** Styled red for destructive actions (Delete). */
  danger?: boolean;
  onPress: () => void;
}

export type MenuEntry = MenuItem | 'divider';

interface Props {
  /** Viewport coords to anchor at, or null when closed. */
  at: { x: number; y: number } | null;
  items: MenuEntry[];
  onClose: () => void;
}

const MENU_WIDTH = 180;
const ITEM_H = 32;

/**
 * Web-only wrapper adding double-click + right-click to its children (RN has no
 * mouse events; the app is desktop-first, so a raw DOM element is the reliable
 * route — same precedent as StatusManager's <input>/<select>). On native it
 * renders the children untouched.
 */
export function MouseArea({
  onDoubleClick,
  onContextMenu,
  style,
  children,
}: {
  onDoubleClick?: () => void;
  onContextMenu: (x: number, y: number) => void;
  style?: CSSProperties;
  children: ReactNode;
}) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <div
      style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', minWidth: 0, ...style }}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
    >
      {children}
    </div>
  );
}

export function ContextMenu({ at, items, onClose }: Props) {
  if (!at) return null;

  // Clamp to the viewport so the menu never opens half off-screen (web only —
  // native Modal coordinates already are window-relative).
  let { x, y } = at;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const height = items.reduce((h, i) => h + (i === 'divider' ? 9 : ITEM_H), 12);
    x = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
    y = Math.min(y, window.innerHeight - height - 8);
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.menu, { left: x, top: y }]}>
          {items.map((item, i) =>
            item === 'divider' ? (
              <View key={`d${i}`} style={styles.divider} />
            ) : (
              <Pressable
                key={item.label}
                style={({ pressed, hovered }: any) => [
                  styles.item,
                  (pressed || hovered) && styles.itemHover,
                ]}
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
              >
                <Text style={[styles.itemText, item.danger && styles.itemDanger]}>
                  {item.label}
                </Text>
              </Pressable>
            ),
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
  },
  item: { height: ITEM_H, justifyContent: 'center', paddingHorizontal: 12 },
  itemHover: { backgroundColor: '#eef2ff' },
  itemText: { fontSize: 13, color: '#374151' },
  itemDanger: { color: '#b91c1c' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 4 },
});
