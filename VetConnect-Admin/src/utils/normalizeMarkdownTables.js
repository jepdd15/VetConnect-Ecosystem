/**
 * normalizeMarkdownTables.js
 *
 * Pre-processes AI-generated markdown text so that GFM table syntax is
 * guaranteed to parse correctly in ReactMarkdown.
 *
 * Claude's output routinely omits the blank line before/after a table block,
 * forgets a trailing pipe on some rows, or produces dense pipe spacing that
 * the GFM parser rejects. This utility normalises those patterns without
 * touching any non-table content.
 *
 * Rules applied (in order per line):
 *  1. Blank line injected before a table block that follows a non-table line.
 *  2. Missing trailing `|` appended to any table line lacking one.
 *  3. Data-row cells normalised to `| content |` spacing.
 *  4. Delimiter rows (`|---|`) normalised to `| --- |` with alignment
 *     markers (`:`) preserved.
 *  5. Blank line injected after a table block before the next non-table line.
 */

/**
 * Returns true when the trimmed line is a GFM table delimiter row:
 * it must consist only of pipes, dashes, colons, and whitespace.
 *
 * @param {string} trimmed - Already-trimmed line content.
 * @returns {boolean}
 */
function isDelimiterRow(trimmed) {
  return /^\|[\s|:\-]+\|$/.test(trimmed);
}

/**
 * Normalises a single data-row table line so each cell has exactly one
 * space of padding: `|col1|col2|` → `| col1 | col2 |`.
 *
 * @param {string} trimmed - Already-trimmed table line.
 * @returns {string}
 */
function normalizeDataRow(trimmed) {
  const cells = trimmed.split('|');
  // cells[0] is empty (before leading `|`); cells[last] is empty (after trailing `|`)
  const normalized = cells.map((cell, idx) => {
    if (idx === 0 || idx === cells.length - 1) return cell;
    return ` ${cell.trim()} `;
  });
  return normalized.join('|');
}

/**
 * Normalises a GFM delimiter row so each segment reads `| --- |`,
 * `| :--- |`, `| ---: |`, or `| :---: |` depending on the original
 * alignment marker.
 *
 * @param {string} trimmed - Already-trimmed delimiter line.
 * @returns {string}
 */
function normalizeDelimiterRow(trimmed) {
  // Replace each `|<inner>` segment, preserving leading/trailing `:` markers
  let result = trimmed.replace(/\|([^|]*)/g, (_, inner) => {
    const stripped = inner.trim();
    if (!stripped) return '|';
    return `| ${stripped} `;
  });
  if (!result.endsWith('|')) result += '|';
  return result;
}

/**
 * Pre-processes AI-generated markdown so GFM tables render correctly in
 * ReactMarkdown. Safe to call with `null` or `undefined` — returns the
 * value unchanged.
 *
 * @param {string | null | undefined} text - Raw markdown from the LLM.
 * @returns {string | null | undefined} Markdown with table formatting fixed.
 */
export function normalizeMarkdownTables(text) {
  if (!text) return text;

  const lines = text.split('\n');
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isTableLine = trimmed.startsWith('|');

    // Last line already pushed into result (accounts for any blank we injected)
    const prevPushed = result.length > 0 ? result[result.length - 1].trim() : undefined;
    const prevIsTable = prevPushed !== undefined && prevPushed.startsWith('|');

    // Rule 1: inject blank line before table block when preceded by content
    if (isTableLine && !prevIsTable && prevPushed !== '' && prevPushed !== undefined) {
      result.push('');
    }

    if (isTableLine) {
      // Rule 2: ensure line ends with `|`
      let normalized = trimmed;
      if (!normalized.endsWith('|')) {
        normalized += ' |';
      }

      // Rules 3 & 4: normalise cell spacing
      if (isDelimiterRow(normalized)) {
        normalized = normalizeDelimiterRow(normalized);
      } else {
        normalized = normalizeDataRow(normalized);
      }

      result.push(normalized);
    } else {
      // Rule 5: inject blank line after table block before non-empty content
      if (prevIsTable && trimmed !== '') {
        result.push('');
      }
      result.push(line);
    }
  }

  return result.join('\n');
}
