import { EmbeddingProvider } from "../provider";
import { EMBEDDING_CONFIG } from "../config";
import crypto from "crypto";

/**
 * A Development-only Embedding Provider.
 *
 * This DOES NOT make any external API calls. Instead, it generates a
 * deterministic pseudo-random vector based on the SHA-256 hash of the input text.
 *
 * This allows the entire storage, batching, similarity search, and retrieval
 * pipeline to be built, tested, and verified locally without needing actual
 * API keys or paying for usage.
 *
 * Vectors for similar texts will NOT be mathematically "close" in cosine similarity
 * in the same way real embeddings are, but exact duplicate texts will yield
 * exact duplicate vectors, and search functions will still execute successfully.
 */
export class DevEmbeddingProvider implements EmbeddingProvider {
  name = "dev";

  /**
   * Deterministically generates a vector of length EMBEDDING_CONFIG.DIMENSIONS.
   */
  private generateDeterministicVector(text: string): number[] {
    const dim = EMBEDDING_CONFIG.DIMENSIONS;
    const vector = new Array(dim);
    
    // Create a hash of the text to use as a seed
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    
    // Simple deterministic pseudo-random number generator (LCG) based on hash
    let seed = parseInt(hash.substring(0, 8), 16);
    
    // LCG parameters
    const m = 0x80000000;
    const a = 1103515245;
    const c = 12345;

    for (let i = 0; i < dim; i++) {
      seed = (a * seed + c) % m;
      // Normalize to [-1, 1] range to simulate embedding components
      vector[i] = (seed / (m - 1)) * 2 - 1;
    }

    // Normalize the vector to length 1 (L2 normalization)
    // as is standard for cosine similarity (dot product = cosine similarity for normalized vectors)
    let magnitudeSq = 0;
    for (let i = 0; i < dim; i++) {
      magnitudeSq += vector[i] * vector[i];
    }
    
    const magnitude = Math.sqrt(magnitudeSq);
    if (magnitude > 0) {
      for (let i = 0; i < dim; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Simulate slight network delay
    await new Promise((resolve) => setTimeout(resolve, 50));
    return this.generateDeterministicVector(text);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Simulate network delay for batch
    await new Promise((resolve) => setTimeout(resolve, 200));
    return texts.map((text) => this.generateDeterministicVector(text));
  }
}
