import mammoth from "mammoth";
import { DocumentProcessor } from "./processor";

export class DocxProcessor implements DocumentProcessor {
  async extract(buffer: Buffer): Promise<string> {
    // mammoth.extractRawText extracts plain text from DOCX,
    // preserving paragraph breaks as newlines.
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }
}
