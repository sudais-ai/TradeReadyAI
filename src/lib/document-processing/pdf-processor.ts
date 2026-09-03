// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");
import { DocumentProcessor } from "./processor";

interface TextItem {
  str: string;
}

export class PdfProcessor implements DocumentProcessor {
  async extract(buffer: Buffer): Promise<string> {
    // pdfjs-dist v6.x rejects Node.js Buffer and requires Uint8Array
    // (it prototype-checks the data argument internally). Wrap the
    // buffer in a fresh Uint8Array view to be safe across pdfjs
    // versions and any future ones that tighten the type check.
    const data = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    let fullText = "";

    for (let i = 1; i <= data.numPages; i++) {
      const page = await data.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: TextItem) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }

    return fullText;
  }
}
