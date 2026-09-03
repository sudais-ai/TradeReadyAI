import * as XLSX from "xlsx";
import { DocumentProcessor } from "./processor";

export class SpreadsheetProcessor implements DocumentProcessor {
  async extract(buffer: Buffer): Promise<string> {
    // Read the workbook from buffer (works for XLSX and CSV)
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];

      // Convert sheet to array-of-arrays for structured text output
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });

      if (rows.length === 0) continue;

      parts.push(`Sheet: ${sheetName}`);
      parts.push("");

      for (const row of rows) {
        // Join cells with a pipe separator, trim each cell
        const line = (row as unknown[])
          .map((cell) =>
            cell === null || cell === undefined ? "" : String(cell).trim()
          )
          .join(" | ");
        if (line.trim()) {
          parts.push(line);
        }
      }

      parts.push(""); // blank line between sheets
    }

    return parts.join("\n").trim();
  }
}
