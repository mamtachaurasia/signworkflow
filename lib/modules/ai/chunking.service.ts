const DEFAULT_CHUNK_SIZE = 3000;
const CHUNK_OVERLAP = 200;

export interface TextChunk {
  index: number;
  text: string;
  startChar: number;
  endChar: number;
  tokenEstimate: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitByParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function chunkText(
  text: string,
  maxChunkSizeTokens: number = DEFAULT_CHUNK_SIZE
): TextChunk[] {
  const maxChunkChars = maxChunkSizeTokens * 4;

  const paragraphs = splitByParagraphs(text);
  const chunks: TextChunk[] = [];
  let currentChunk = '';
  let startChar = 0;
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const paragraphLength = paragraph.length;

    if (currentChunk.length + paragraphLength + 1 > maxChunkChars && currentChunk.length > 0) {
      chunks.push({
        index: chunkIndex,
        text: currentChunk,
        startChar,
        endChar: startChar + currentChunk.length,
        tokenEstimate: estimateTokens(currentChunk),
      });

      const overlapLength = Math.min(CHUNK_OVERLAP * 4, currentChunk.length / 2);
      const overlapText = currentChunk.substring(currentChunk.length - overlapLength);
      currentChunk = overlapText + '\n\n' + paragraph;
      startChar = startChar + currentChunk.length - overlapLength;
      chunkIndex++;
    } else {
      if (currentChunk.length > 0) {
        currentChunk += '\n\n';
      }
      currentChunk += paragraph;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({
      index: chunkIndex,
      text: currentChunk,
      startChar,
      endChar: startChar + currentChunk.length,
      tokenEstimate: estimateTokens(currentChunk),
    });
  }

  return chunks;
}
