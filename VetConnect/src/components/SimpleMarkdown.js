import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme/mobileTokens';

/**
 * Lightweight markdown-ish renderer for AI chat responses.
 *
 * Handles the patterns Claude Haiku actually produces in pet history Q&A:
 *   - **bold** text
 *   - ## Headings (1-3 hash marks)
 *   - - Bullet list items (* also supported)
 *   - 1. Numbered list items
 *   - Paragraph breaks (double newline)
 *
 * NOT a full markdown parser. No npm install required — regex-based only.
 * Returns null for falsy or empty input.
 *
 * @param {object} props
 * @param {string} props.text  - Markdown-ish text to render
 * @param {object} [props.style] - Optional style overrides for the container View
 */
export default function SimpleMarkdown({ text, style }) {
  if (!text) return null;

  // Split on double newlines to get semantic paragraphs, then process each line.
  const paragraphs = text.split(/\n\n+/);

  return (
    <View style={style}>
      {paragraphs.map((para, paragraphIndex) => {
        const lines = para.split('\n');
        return (
          <View key={paragraphIndex} style={paragraphIndex > 0 ? styles.paragraph : undefined}>
            {lines.map((line, lineIndex) =>
              renderLine(line, `${paragraphIndex}-${lineIndex}`)
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Renders a single line with the appropriate element type.
 * Returns null for empty lines.
 *
 * @param {string} line - A single line of text
 * @param {string} key  - React key for the element
 */
function renderLine(line, key) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // ## Heading (1-3 hash marks)
  if (/^#{1,3}\s+/.test(trimmed)) {
    const headingText = trimmed.replace(/^#{1,3}\s+/, '');
    return (
      <Text key={key} style={styles.heading}>
        {renderInline(headingText)}
      </Text>
    );
  }

  // - Bullet list item (* also supported)
  if (/^[-*]\s+/.test(trimmed)) {
    const bulletText = trimmed.replace(/^[-*]\s+/, '');
    return (
      <View key={key} style={styles.bulletRow}>
        <Text style={styles.bulletSymbol}>{'  •  '}</Text>
        <Text style={styles.bodyText}>{renderInline(bulletText)}</Text>
      </View>
    );
  }

  // 1. Numbered list item
  if (/^\d+\.\s+/.test(trimmed)) {
    const match = trimmed.match(/^(\d+\.)\s+(.*)/);
    if (match) {
      return (
        <View key={key} style={styles.bulletRow}>
          <Text style={styles.bulletSymbol}>{'  '}{match[1]}{'  '}</Text>
          <Text style={styles.bodyText}>{renderInline(match[2])}</Text>
        </View>
      );
    }
  }

  // Plain paragraph text
  return (
    <Text key={key} style={styles.bodyText}>
      {renderInline(trimmed)}
    </Text>
  );
}

/**
 * Splits text on **bold** markers and returns an array of Text nodes.
 * Non-bold segments are returned as plain strings; bold segments
 * are wrapped in a Text node with the bold style.
 *
 * @param {string} text - Inline text that may contain **bold** spans
 * @returns {Array} Mixed array of strings and React Text elements
 */
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (/^\*\*(.+)\*\*$/.test(part)) {
      return (
        <Text key={index} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={index}>{part}</Text>;
  });
}

const styles = StyleSheet.create({
  paragraph: {
    marginTop: 8,
  },
  heading: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.brand,
    marginBottom: 4,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bodyText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
    flexShrink: 1,
  },
  bold: {
    fontWeight: '800',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  bulletSymbol: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
});
