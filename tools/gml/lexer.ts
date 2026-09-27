// GML lexer for UndertaleModTool (Underanalyzer) decompiler output.

export type TokKind = 'num' | 'str' | 'tmpl' | 'id' | 'op' | 'eof';

export interface Token {
  kind: TokKind;
  value: string;
  /** numeric value for 'num' */
  num?: number;
  /** true when the literal was written in integer form (no '.', no exponent) */
  int?: boolean;
  /** template string parts for 'tmpl': alternating string / expression source */
  parts?: string[];
  line: number;
}

const OPS = [
  '>>=', '<<=', '??=',
  '==', '!=', '<=', '>=', '&&', '||', '^^', '++', '--', '+=', '-=', '*=', '/=', '%=', '|=', '&=', '^=', '<<', '>>', '??',
  '[@', '[?', '[|', '[#', '[$',
  '{', '}', '(', ')', '[', ']', ';', ',', '.', ':', '?', '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '&', '|', '^',
];

export class LexError extends Error {}

function readEscapes(src: string, i: number, quote: string): [string, number] {
  let out = '';
  while (i < src.length && src[i] !== quote) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      i += 2;
      switch (n) {
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'v': out += '\v'; break;
        case 'a': out += '\x07'; break;
        case '0': out += '\0'; break;
        case '\\': out += '\\'; break;
        case '"': out += '"'; break;
        case "'": out += "'"; break;
        case '\n': break;
        case 'x': {
          const hex = src.substr(i, 2);
          out += String.fromCharCode(parseInt(hex, 16));
          i += 2;
          break;
        }
        case 'u': {
          let j = i;
          while (j < src.length && j < i + 6 && /[0-9a-fA-F]/.test(src[j])) j++;
          out += String.fromCodePoint(parseInt(src.slice(i, j), 16));
          i = j;
          break;
        }
        default: out += n; break;
      }
    } else {
      out += c;
      i++;
    }
  }
  if (src[i] !== quote) throw new LexError('unterminated string');
  return [out, i + 1];
}

export function lex(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2;
      continue;
    }
    if (c === '#' && /^[0-9a-fA-F]{6}(?![0-9a-zA-Z_])/.test(src.slice(i + 1, i + 8))) {
      // CSS-style colour literal #RRGGBB -> GameMaker BGR integer
      const h = src.slice(i + 1, i + 7);
      const rr = parseInt(h.slice(0, 2), 16), gg = parseInt(h.slice(2, 4), 16), bb = parseInt(h.slice(4, 6), 16);
      toks.push({ kind: 'num', value: '#' + h, num: rr | (gg << 8) | (bb << 16), int: true, line });
      i += 7;
      continue;
    }
    if (c === '#') {
      // #region / #endregion / #macro lines: skip (decompiler output does not use them meaningfully)
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // numbers
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        j = i + 2;
        while (j < n && /[0-9a-fA-F_]/.test(src[j])) j++;
        const txt = src.slice(i + 2, j).replace(/_/g, '');
        toks.push({ kind: 'num', value: src.slice(i, j), num: hexNum(txt), int: true, line });
        i = j;
        continue;
      }
      while (j < n && /[0-9_]/.test(src[j])) j++;
      let isInt = true;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) { isInt = false; j++; while (j < n && /[0-9_]/.test(src[j])) j++; }
      else if (src[j] === '.' && !/[a-zA-Z_]/.test(src[j + 1] ?? '')) { isInt = false; j++; }
      if ((src[j] === 'e' || src[j] === 'E') && /[0-9+-]/.test(src[j + 1] ?? '')) {
        isInt = false;
        j++;
        if (src[j] === '+' || src[j] === '-') j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      const txt = src.slice(i, j).replace(/_/g, '');
      toks.push({ kind: 'num', value: txt, num: Number(txt), int: isInt, line });
      i = j;
      continue;
    }
    if (c === '$' && /[0-9a-fA-F]/.test(src[i + 1] ?? '')) {
      let j = i + 1;
      while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
      toks.push({ kind: 'num', value: src.slice(i, j), num: hexNum(src.slice(i + 1, j)), int: true, line });
      i = j;
      continue;
    }
    if (c === '$' && src[i + 1] === '"') {
      // template string: $"text {expr} text"
      const parts: string[] = [];
      let j = i + 2;
      let cur = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\') {
          const [s, k] = readEscapes(src.slice(j, j + 2) + '"', 0, '"');
          cur += s;
          j += k - 1;
          continue;
        }
        if (src[j] === '{') {
          parts.push(cur); cur = '';
          let depth = 1; let k = j + 1;
          while (k < n && depth > 0) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; }
          parts.push(src.slice(j + 1, k - 1));
          j = k;
          continue;
        }
        cur += src[j]; j++;
      }
      parts.push(cur);
      toks.push({ kind: 'tmpl', value: src.slice(i, j + 1), parts, line });
      i = j + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const [s, j] = readEscapes(src, i + 1, c);
      for (let k = i; k < j; k++) if (src[k] === '\n') line++;
      toks.push({ kind: 'str', value: s, line });
      i = j;
      continue;
    }
    if (c === '@' && (src[i + 1] === '"' || src[i + 1] === "'")) {
      const q = src[i + 1];
      let j = i + 2;
      while (j < n && src[j] !== q) { if (src[j] === '\n') line++; j++; }
      toks.push({ kind: 'str', value: src.slice(i + 2, j), line });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ kind: 'id', value: src.slice(i, j), line });
      i = j;
      continue;
    }
    let matched = false;
    for (const op of OPS) {
      if (src.startsWith(op, i)) {
        toks.push({ kind: 'op', value: op, line });
        i += op.length;
        matched = true;
        break;
      }
    }
    if (!matched) throw new LexError(`unexpected char '${c}' at line ${line}`);
  }
  toks.push({ kind: 'eof', value: '', line });
  return toks;
}

function hexNum(h: string): number {
  // values beyond 2^53 lose precision; GML int64 hex literals are rare in this codebase
  return h.length === 0 ? 0 : Number(BigInt('0x' + h));
}
