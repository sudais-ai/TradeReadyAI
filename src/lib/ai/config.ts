/**
 * Centralized configuration for the AI Evaluation Foundation.
 */

export const AI_CONFIG = {
  PROVIDER: process.env.AI_PROVIDER || "opencode",
  MODEL: process.env.AI_MODEL || "nemotron-3-ultra-free",
  API_KEY: process.env.OPENCODE_ZEN_API_KEY || process.env.AI_API_KEY || "",
  BASE_URL: process.env.AI_API_BASE_URL || "https://opencode.ai/zen/v1",
  MAX_RETRIES: parseInt(process.env.AI_MAX_RETRIES || "3", 10),
  TIMEOUT_MS: parseInt(process.env.AI_TIMEOUT_MS || "120000", 10),
};
