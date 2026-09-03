import { EMBEDDING_CONFIG } from "./config";
import { EmbeddingProvider } from "./provider";
import { DevEmbeddingProvider } from "./providers/dev-provider";
import { OpenCodeZenEmbeddingProvider } from "./providers/opencode-embedding-provider";
import { LocalEmbeddingProvider } from "./providers/local-provider";

let providerInstance: EmbeddingProvider | null = null;

/**
 * Returns the currently configured embedding provider.
 * Implements a singleton pattern.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (providerInstance) return providerInstance;

  switch (EMBEDDING_CONFIG.PROVIDER) {
    case "dev":
      providerInstance = new DevEmbeddingProvider();
      break;
    case "local":
      providerInstance = new LocalEmbeddingProvider();
      break;
    case "opencode":
      providerInstance = new OpenCodeZenEmbeddingProvider();
      break;
    // Add other real providers here in the future
    default:
      console.warn(`Unknown provider '${EMBEDDING_CONFIG.PROVIDER}'. Falling back to 'dev'.`);
      providerInstance = new DevEmbeddingProvider();
      break;
  }

  return providerInstance;
}
