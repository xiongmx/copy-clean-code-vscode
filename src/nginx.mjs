/**
 * Mark native nginx.conf hash comments without interpreting quoted strings as
 * code. This is a lexical scanner, not a configuration validator or Lua parser.
 * Nginx starts # comments at token boundaries; foo#bar is a literal argument.
 * Reference: nginx/src/core/ngx_conf_file.c, ngx_conf_read_token.
 * Returned offsets are UTF-16, matching the shared stripping pipeline.
 */
export function markNginxComments(source) {
  const removed = new Uint8Array(source.length);
  let quote = '';
  let escaped = false;
  let comment = false;
  let tokenStart = true;
  let variable = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (comment) {
      if (ch === '\n') {
        comment = false;
        tokenStart = true;
      } else {
        removed[i] = 1;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      tokenStart = false;
      variable = false;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (tokenStart && ch === '#') {
      comment = true;
      removed[i] = 1;
      continue;
    }
    if (tokenStart && (ch === '"' || ch === "'")) {
      quote = ch;
      tokenStart = false;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      tokenStart = true;
      variable = false;
      continue;
    }
    // ${name} is part of an argument, not a block opening.
    if (ch === '{' && variable) {
      variable = false;
      continue;
    }
    variable = ch === '$';
    if (ch === ';' || ch === '{' || (ch === '}' && tokenStart)) {
      tokenStart = true;
    } else {
      tokenStart = false;
    }
  }
  return removed;
}
