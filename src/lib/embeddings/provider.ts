/**
 * Standardized interface for any Embedding Provider.
 * This abstraction allows swapping between OpenAI, Cohere, Local models, etc.,
 * without changing the core application logic.
 */
export interface EmbeddingProvider {
  /**
   * The identifier for this provider (e.g., 'openai', 'dev').
   */
  readonly name: string;

  /**
   * Generate an embedding vector for a single string of text.
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Generate embedding vectors for an array of text strings.
   * Providers that support batching should implement this natively for efficiency.
   * The returned array of vectors must strictly match the order of the input texts.
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}
