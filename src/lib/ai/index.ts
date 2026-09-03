import { AIProvider } from "./provider";
import { AI_CONFIG } from "./config";
import { OpenCodeZenProvider } from "./providers/opencode-zen-provider";

let providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (providerInstance) return providerInstance;

  switch (AI_CONFIG.PROVIDER) {
    case "opencode":
      providerInstance = new OpenCodeZenProvider();
      break;
    default:
      console.warn(`Unknown AI provider '${AI_CONFIG.PROVIDER}', falling back to opencode`);
      providerInstance = new OpenCodeZenProvider();
  }

  return providerInstance;
}
