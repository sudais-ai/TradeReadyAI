/**
 * Configuration for document chunking.
 */
export interface ChunkConfig {
  targetChunkSize: number;
  minChunkSize: number;
  overlapSize: number;
}

// Sensible defaults for RAG text extraction without embeddings yet.
// These are purely character-based estimates (approx 4 chars per token).
export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  targetChunkSize: 1000, // ~250 tokens
  minChunkSize: 100,     // ~25 tokens
  overlapSize: 200,      // ~50 tokens
};

/**
 * A simple representation of a generated chunk before DB storage.
 */
export interface ChunkData {
  index: number;
  content: string;
  characterCount: number;
}

/**
 * Generates overlapping chunks from normalized text.
 * Strategy: Splits text into paragraphs by double newline (\n\n),
 * and groups them together up to targetChunkSize. 
 * Adds overlap characters from previous chunk.
 */
export function generateChunks(
  text: string,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): ChunkData[] {
  if (!text || text.trim() === "") {
    return [];
  }

  const chunks: ChunkData[] = [];
  
  // Split into paragraphs based on normalized double newlines.
  // Using \n+ gracefully handles cases where there are 1 or 3 newlines, 
  // but we prefer \n\n as the paragraph separator in normalized text.
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);

  if (paragraphs.length === 0) {
    return [];
  }

  let currentChunkContent = "";
  let chunkIndex = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];

    // If the paragraph itself is larger than the target size, we still add it
    // rather than breaking it mid-sentence. Further refinement can split by sentence
    // if extreme edge cases emerge.
    if (currentChunkContent.length === 0) {
      currentChunkContent = paragraph;
    } else {
      const projectedLength = currentChunkContent.length + 2 + paragraph.length; // +2 for \n\n
      
      if (projectedLength <= config.targetChunkSize) {
        currentChunkContent += `\n\n${paragraph}`;
      } else {
        // Current chunk is full. Save it.
        if (currentChunkContent.length >= config.minChunkSize) {
          chunks.push({
            index: chunkIndex++,
            content: currentChunkContent,
            characterCount: currentChunkContent.length,
          });

          // Start the next chunk with overlap from the END of the current chunk
          // We look for a sensible whitespace boundary near the overlap size limit.
          let overlapText = "";
          if (config.overlapSize > 0 && currentChunkContent.length > config.overlapSize) {
             // Find overlap starting point
             const overlapStartIdx = currentChunkContent.length - config.overlapSize;
             // Try to snap to the nearest preceding whitespace to avoid cutting words
             let snapIdx = overlapStartIdx;
             while (snapIdx > 0 && !/\s/.test(currentChunkContent[snapIdx])) {
               snapIdx--;
             }
             
             // If we couldn't find a whitespace within a reasonable distance, fallback
             if (snapIdx === 0) snapIdx = overlapStartIdx;
             
             overlapText = currentChunkContent.substring(snapIdx).trim();
          } else if (config.overlapSize >= currentChunkContent.length) {
             overlapText = currentChunkContent;
          }

          currentChunkContent = overlapText ? `${overlapText}\n\n${paragraph}` : paragraph;
        } else {
          // If the chunk somehow was under min size, just keep appending
          currentChunkContent += `\n\n${paragraph}`;
        }
      }
    }
  }

  // Add the final chunk if it meets minimum size (or if it's the ONLY chunk)
  if (currentChunkContent.trim().length > 0) {
    if (currentChunkContent.trim().length >= config.minChunkSize || chunkIndex === 0) {
      const finalContent = currentChunkContent.trim();
      chunks.push({
        index: chunkIndex++,
        content: finalContent,
        characterCount: finalContent.length,
      });
    }
  }

  return chunks;
}
