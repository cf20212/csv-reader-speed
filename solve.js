// Fast drop-in replacement for csv-reader 1.0.0: run(input) returns exactly csv-reader's answer
// {columns, rows, errors} for every input, computed with slice-based scanning (indexOf jumps
// between structural characters) instead of the reference's character-at-a-time concatenation.
// The broken-row policy is csv-reader's own, followed exactly:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a quoted field runs to the next quote that is not doubled ("" inside it is one quote, and
//     each CRLF or lone CR inside it is read as LF); what follows its closing quote, up to the
//     next comma or line break, is appended as it stands (quote_junk, when the field ends);
//   - a quote that never closes is a literal character and the text after it is read again as
//     unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings;
//   - columns is the first record when header is true, else null; rows are padded ("") or cut
//     to the first record's width (short_row / long_row);
//   - each error is {code, line, row} in the order met: line the 1-based line its record starts
//     on (every LF, CRLF and lone CR inside quotes counted), row its record's index in rows
//     (null for the header).

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  // Out-parameters of the field readers.
  let fv = '';
  let fe = END;
  let fa = 0;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed
  // by LF is dropped (stray_cr). Sets fv (the field), fe (how it ended) and fa (characters kept).
  function readUnquoted(value) {
    let added = 0;
    while (true) {
      const start = pos;
      const iComma = text.indexOf(',', start);
      const iLF = text.indexOf('\n', start);
      let end;
      let term;
      if (iComma === -1 && iLF === -1) {
        end = n;
        term = END;
      } else if (iLF === -1 || (iComma !== -1 && iComma < iLF)) {
        end = iComma;
        term = COMMA;
      } else {
        end = iLF;
        term = LINE_BREAK;
      }
      const iCR = text.indexOf('\r', start);
      if (iCR === -1 || iCR >= end) {
        // No CR before the terminator: the whole segment is kept as one slice.
        if (end > start) {
          value += text.slice(start, end);
          added += end - start;
        }
        pos = term === END ? end : end + 1;
        if (term === LINE_BREAK) line += 1;
        fv = value;
        fe = term;
        fa = added;
        return;
      }
      if (term === LINE_BREAK && iCR === end - 1) {
        // The CR is the first half of the CRLF that ends the field.
        if (end - 1 > start) {
          value += text.slice(start, end - 1);
          added += end - 1 - start;
        }
        pos = end + 1;
        line += 1;
        fv = value;
        fe = LINE_BREAK;
        fa = added;
        return;
      }
      // A stray CR sits inside this field: finish it character by character, exactly as the
      // reference does (rare; the fixtures' stray CRs are sparse).
      while (pos < n) {
        const c = text[pos];
        if (c === ',') {
          pos += 1;
          fv = value;
          fe = COMMA;
          fa = added;
          return;
        }
        if (c === '\n') {
          pos += 1;
          line += 1;
          fv = value;
          fe = LINE_BREAK;
          fa = added;
          return;
        }
        if (c === '\r') {
          if (text[pos + 1] === '\n') {
            pos += 2;
            line += 1;
            fv = value;
            fe = LINE_BREAK;
            fa = added;
            return;
          }
          error('stray_cr');
          pos += 1;
          continue;
        }
        value += c;
        added += 1;
        pos += 1;
      }
      fv = value;
      fe = END;
      fa = added;
      return;
    }
  }

  // Counts the line breaks in text[from, to): each LF, each CRLF and each lone CR counts once.
  function countBreaks(from, to) {
    let cnt = 0;
    let k = from;
    while ((k = text.indexOf('\n', k)) !== -1 && k < to) {
      cnt += 1;
      k += 1;
    }
    k = from;
    while ((k = text.indexOf('\r', k)) !== -1 && k < to) {
      if (text[k + 1] !== '\n') cnt += 1;
      k += 1;
    }
    return cnt;
  }

  // Reads a quoted field whose opening quote is at pos. Sets fv and fe.
  function readQuoted() {
    const open = pos;
    const s = open + 1;
    // Find the closing quote: the next quote that is not doubled.
    let j = s;
    let close = -1;
    let escaped = false;
    while (true) {
      j = text.indexOf('"', j);
      if (j === -1) break;
      if (text.charCodeAt(j + 1) === 34) {
        escaped = true;
        j += 2;
        continue;
      }
      close = j;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text after it is read again
      // as unquoted. Line was never advanced during the scan, so nothing needs restoring.
      error('unterminated_quote');
      pos = s;
      readUnquoted('"');
      return;
    }
    const iCR = text.indexOf('\r', s);
    const hasCR = iCR !== -1 && iCR < close;
    let value;
    if (!escaped && !hasCR) {
      value = text.slice(s, close);
      // Only LFs can advance the line here.
      let k = s;
      while ((k = text.indexOf('\n', k)) !== -1 && k < close) {
        line += 1;
        k += 1;
      }
    } else {
      line += countBreaks(s, close);
      const raw = text.slice(s, close);
      value = hasCR ? raw.replace(/\r\n|\r/g, '\n').replace(/""/g, '"') : raw.replace(/""/g, '"');
    }
    pos = close + 1;
    if (pos >= n) {
      fv = value;
      fe = END;
      return;
    }
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      fv = value;
      fe = COMMA;
      return;
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      fv = value;
      fe = LINE_BREAK;
      return;
    }
    if (c === '\r' && text[pos + 1] === '\n') {
      pos += 2;
      line += 1;
      fv = value;
      fe = LINE_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line
    // break; stray_cr errors met inside it are recorded before quote_junk, as in the reference.
    readUnquoted(value);
    if (fa > 0) error('quote_junk');
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text[pos] === '"';
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fv);
    } while (fe === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr
    // errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
