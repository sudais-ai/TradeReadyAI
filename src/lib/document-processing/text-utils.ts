/**
 * Normalizes extracted text for clean storage and future RAG/chunking.
 * Goals:
 *   - Remove null bytes and control characters
 *   - Collapse excessive blank lines (max 2 consecutive)
 *   - Normalize various line ending styles to \n
 *   - Trim leading/trailing whitespace
 *   - Preserve meaningful content structure
 */
export function normalizeText(raw: string): string {
  if (!raw) return "";

  let text = raw;

  // Remove null bytes and most control characters (keep \n, \r, \t)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Normalize Windows/Mac line endings to Unix
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Replace tabs with a single space
  text = text.replace(/\t/g, " ");

  // Collapse runs of spaces within a line (but not newlines)
  text = text.replace(/[ ]{2,}/g, " ");

  // Trim trailing spaces from each line
  text = text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  // Collapse more than 2 consecutive blank lines into exactly 2
  text = text.replace(/\n{3,}/g, "\n\n");

  // Trim overall leading/trailing whitespace
  text = text.trim();

  return text;
}

/**
 * Returns true if the text is considered meaningful (not empty or whitespace-only).
 */
export function hasContent(text: string): boolean {
  return text.trim().length > 0;
}
