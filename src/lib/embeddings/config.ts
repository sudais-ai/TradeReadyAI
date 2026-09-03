/**
 * Centralized configuration for the Embedding Foundation.
 * All embedding-related settings and feature flags should be managed here.
 */

export const EMBEDDING_CONFIG = {
  // The configured provider (e.g., 'local', 'opencode', 'dev').
  // Defaults to 'local' for production real semantic embeddings without external API.
  PROVIDER: process.env.EMBEDDING_PROVIDER || "local",

  // The specific model to use for embeddings.
  MODEL: process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2",

  // The dimensionality of the vectors produced by the selected model.
  // Must match the actual output of the provider/model (384 for all-MiniLM-L6-v2).
  DIMENSIONS: parseInt(process.env.EMBEDDING_DIMENSIONS || "384", 10),

  // API credentials (used by external providers like opencode)
  API_KEY: process.env.OPENCODE_ZEN_API_KEY || process.env.EMBEDDING_API_KEY || "",
  
  // Base URL for the embedding API
  BASE_URL: process.env.EMBEDDING_API_BASE_URL || "https://opencode.ai/zen/v1",
  
  // Timeout for API requests in milliseconds
  TIMEOUT_MS: parseInt(process.env.EMBEDDING_TIMEOUT_MS || "60000", 10),

  // How many chunks to process in a single batch request to the provider.
  BATCH_SIZE: parseInt(process.env.EMBEDDING_BATCH_SIZE || "20", 10),

  // How many times to retry a failed embedding request before giving up.
  MAX_RETRIES: parseInt(process.env.EMBEDDING_MAX_RETRIES || "3", 10),

  // Minimum similarity score for a chunk to be considered "relevant" in search.
  // 0.7 to 0.85 is typical for cosine similarity on normalized text.
  DEFAULT_SIMILARITY_THRESHOLD: parseFloat(process.env.EMBEDDING_SIMILARITY_THRESHOLD || "0.25"),

  // Number of chunks to return by default in a similarity search.
  DEFAULT_TOP_K: parseInt(process.env.EMBEDDING_TOP_K || "5", 10),
};
