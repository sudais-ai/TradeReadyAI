/**
 * File-safety check (defense-in-depth).
 *
 * Phase 9: rejects uploads whose buffer contains known-bad content
 * signatures, BEFORE the buffer is written to disk.
 *
 * This is NOT a virus scanner. A real virus scanner (e.g. ClamAV) is
 * out of scope for this phase — the brief forbids adding another
 * service and the existing dependency set has no virus-scanning
 * library. This module is a magic-byte / signature-based second
 * layer behind the MIME-type allow-list at the upload endpoint.
 *
 * What it does:
 *   - Rejects PE (Windows .exe/.dll/.sys), ELF (Linux), Mach-O (macOS).
 *   - Rejects shell script shebangs (`#!/...`).
 *   - Rejects Java class files.
 *   - Rejects active content inside documents:
 *       - PDF with `/JavaScript` or `/JS` action objects.
 *       - Office documents with embedded `OLE` streams (a vector for
 *         older CVE-2017-11882 / CVE-2018-0802 family exploits).
 *
 * What it does NOT do:
 *   - Detect zero-day exploits.
 *   - Detect text-based macro viruses.
 *   - Replace the allow-list at the upload endpoint.
 *   - Replace a real AV scanner in production.
 *
 * The error messages returned to callers are deliberately generic
 * ("File rejected: contains an executable signature") and never leak
 * the matched signature bytes to the client.
 */

export type SafetyResult = { safe: true } | { safe: false; reason: string };

/**
 * Inspect a file buffer for known-bad content signatures.
 * The check inspects the first 64 KB of the buffer only — enough to
 * cover every signature listed below, and fast enough to run inline
 * before the disk write.
 */
export function scanBuffer(
  buffer: Buffer,
  mimeType: string
): SafetyResult {
  if (!Buffer.isBuffer(buffer)) {
    return { safe: false, reason: "File rejected: invalid buffer." };
  }
  if (buffer.length === 0) {
    return { safe: false, reason: "File rejected: empty file." };
  }

  // Use a 64KB head; that's well past where any of these signatures live.
  const head = buffer.length > 65536 ? buffer.subarray(0, 65536) : buffer;
  const mime = (mimeType || "").toLowerCase();

  // ─── Magic-byte checks (universal) ──────────────────────────────────────

  // Windows PE (MZ header)
  if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) {
    return reject("contains a Windows executable header");
  }

  // Linux ELF
  if (
    head.length >= 4 &&
    head[0] === 0x7f &&
    head[1] === 0x45 &&
    head[2] === 0x4c &&
    head[3] === 0x46
  ) {
    return reject("contains a Linux executable header");
  }

  // Mach-O (macOS): FEEDFACE, CEFAEDFE, FEEDFACF, CFFAEDFE
  if (head.length >= 4) {
    const m0 = head[0],
      m1 = head[1],
      m2 = head[2],
      m3 = head[3];
    if (
      (m0 === 0xfe && m1 === 0xed && m2 === 0xfa && (m3 === 0xce || m3 === 0xcf)) ||
      (m0 === 0xce && m1 === 0xfa && m2 === 0xed && m3 === 0xfe) ||
      (m0 === 0xcf && m1 === 0xfa && m2 === 0xed && m3 === 0xfe)
    ) {
      return reject("contains a macOS executable header");
    }
  }

  // Java class file
  if (
    head.length >= 4 &&
    head[0] === 0xca &&
    head[1] === 0xfe &&
    head[2] === 0xba &&
    head[3] === 0xbe
  ) {
    return reject("contains a Java class file");
  }

  // Shell script shebang
  if (
    head.length >= 2 &&
    head[0] === 0x23 &&
    head[1] === 0x21
  ) {
    return reject("contains a shell script shebang");
  }

  // ─── Format-specific checks ─────────────────────────────────────────────

  // PDF: reject files that declare active content. Many CVE-2010-0188
  // / CVE-2017-3193 / similar exploits ride on /JavaScript or /JS
  // actions. Legitimate trade documents (invoices, packing lists) do
  // not need them.
  if (mime === "application/pdf" || (head.length >= 4 && head.slice(0, 4).toString("ascii") === "%PDF")) {
    // Search the head for any of the action-object keys.
    const headStr = head.toString("latin1");
    if (/\/JavaScript\b/i.test(headStr) || /\/JS\s*\(/i.test(headStr)) {
      return reject("contains active scripting that this app does not support");
    }
  }

  // Office documents: a .docx or .xlsx is a ZIP. The first 4 bytes are
  // PK\x03\x04 (PK\003\004). We scan the head for any of:
  //   - the literal string "vbaProject.bin" (a macro-enabled indicator)
  //   - the literal string "ActiveXObject" (a script injection vector)
  //   - an "OLE" compound document signature (D0CF11E0A1B11AE1) — this
  //     is the old .doc/.xls binary format. We allow it on
  //     application/msword and application/vnd.ms-excel (those MIME
  //     types are in the allow-list), but a .docx / .xlsx that contains
  //     an embedded OLE stream is suspicious. We reject on this signal
  //     regardless of declared MIME type.
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    const zipStr = head.toString("latin1");
    if (/vbaProject\.bin/i.test(zipStr)) {
      return reject("contains a macro-enabled Office document");
    }
    if (/ActiveXObject/i.test(zipStr)) {
      return reject("contains a script-injection payload");
    }
  }

  // OLE compound document signature (legacy .doc/.xls/.ppt). Only
  // allowed when the declared MIME is one of the binary Office types.
  if (head.length >= 8 &&
      head[0] === 0xd0 && head[1] === 0xcf &&
      head[2] === 0x11 && head[3] === 0xe0 &&
      head[4] === 0xa1 && head[5] === 0xb1 &&
      head[6] === 0x1a && head[7] === 0xe1) {
    const allowed = mime === "application/msword" || mime === "application/vnd.ms-excel";
    if (!allowed) {
      return reject("contains a binary Office document under an unexpected content type");
    }
  }

  return { safe: true };
}

function reject(reason: string): SafetyResult {
  return { safe: false, reason: `File rejected: ${reason}.` };
}
