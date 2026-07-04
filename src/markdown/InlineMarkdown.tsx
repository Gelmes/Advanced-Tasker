import { Fragment } from 'react';
import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { color } from '../theme';
import { parseInline } from './inline';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Called when a #hashtag is tapped (value excludes the leading #). */
  onTagPress?: (tag: string) => void;
}

/** Renders inline markdown (bold / italic / code / links / #tags) as styled spans. */
export function InlineMarkdown({ text, style, numberOfLines, onTagPress }: Props) {
  const segments = parseInline(text);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'bold':
            return (
              <Text key={i} style={styles.bold}>
                {seg.value}
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} style={styles.italic}>
                {seg.value}
              </Text>
            );
          case 'code':
            return (
              <Text key={i} style={styles.code}>
                {seg.value}
              </Text>
            );
          case 'link':
            return (
              <Text key={i} style={styles.link} onPress={() => void Linking.openURL(seg.href)}>
                {seg.value}
              </Text>
            );
          case 'tag':
            return (
              <Text
                key={i}
                style={styles.tag}
                onPress={(e) => {
                  (e as any)?.stopPropagation?.();
                  onTagPress?.(seg.value);
                }}
              >
                #{seg.value}
              </Text>
            );
          default:
            return <Fragment key={i}>{seg.value}</Fragment>;
        }
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: {
    fontFamily: 'monospace',
    backgroundColor: color.codeBg,
    color: color.danger,
  },
  link: { color: color.info, textDecorationLine: 'underline' },
  tag: { color: color.tagInk, fontWeight: '600' },
});
