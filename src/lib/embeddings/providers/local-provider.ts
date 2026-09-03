import { EmbeddingProvider } from "../provider";
import { pipeline } from "@xenova/transformers";

export class LocalEmbeddingProvider implements EmbeddingProvider {
  name = "local";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractorPromise: Promise<any> | null = null;
  private modelName = "Xenova/all-MiniLM-L6-v2"; // 384 dimensions

  private getExtractor() {
    if (!this.extractorPromise) {
      this.extractorPromise = pipeline("feature-extraction", this.modelName, {
        quantized: true, // Use int8 quantization for speed
      });
    }
    return this.extractorPromise;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const extractor = await this.getExtractor();
    // @xenova/transformers supports batching naturally if passed an array
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    
    // The output is a tensor, we need to convert it to an array of arrays
    // Output shape is [batch_size, dims]
    const embeddings: number[][] = [];
    const batchSize = output.dims[0];
    const dims = output.dims[1];
    
    for (let i = 0; i < batchSize; i++) {
      const start = i * dims;
      const end = start + dims;
      embeddings.push(Array.from(output.data.subarray(start, end)));
    }
    
    return embeddings;
  }
}
