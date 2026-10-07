/**
 * Markup assertions need markup-form text.
 *
 * `renderToStaticMarkup` escapes the five XML-significant characters in a text node, so
 * comparing a rendered sentence against the source string fails on an apostrophe and
 * nobody can tell that from a real copy regression.
 */
export function textInMarkup(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
