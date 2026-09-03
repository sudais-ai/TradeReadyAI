export const RAG_CONFIG = {
  // How many chunks to retrieve as context for the AI
  TOP_K: parseInt(process.env.RAG_TOP_K || "5", 10),
  
  // Similarity threshold for RAG retrieval
  // 0.25 is a reasonable default for all-MiniLM-L6-v2 cosine similarity.
  // Lower values = more permissive retrieval, higher = more strict.
  SIMILARITY_THRESHOLD: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || "0.25"),
};
