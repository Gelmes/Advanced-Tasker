import { Fragment } from 'react';
import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { parseInline } from './inline';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/** Renders inline markdown (bold / italic / code / links) as styled Text spans. */
export function InlineMarkdown({ text, style, numberOfLines }: Props) {
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
    backgroundColor: '#f3f4f6',
    color: '#be123c',
  },
  link: { color: '#2563eb', textDecorationLine: 'underline' },
});
