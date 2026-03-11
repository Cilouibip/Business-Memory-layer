type ChunkOptions = {
  maxTokens?: number;
  overlap?: number;
};

function findSentenceBoundary(text: string, start: number, end: number): number {
  for (let i = end - 1; i >= start; i -= 1) {
    const char = text[i];
    if (char === '.' || char === '!' || char === '?') {
      return i + 1;
    }
  }

  return end;
}

export function chunkText(text: string, options?: ChunkOptions): string[] {
  const maxTokens = options?.maxTokens ?? 1000;
  const overlap = options?.overlap ?? 200;

  const normalizedMaxTokens = Math.max(1, maxTokens);
  const normalizedOverlap = Math.max(0, Math.min(overlap, normalizedMaxTokens - 1));

  const maxChars = normalizedMaxTokens * 4;
  const overlapChars = normalizedOverlap * 4;
  const content = text ?? '';

  if (content.trim().length === 0) {
    return [];
  }

  if (content.length <= maxChars) {
    return [content];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const hardEnd = Math.min(start + maxChars, content.length);
    const end = hardEnd < content.length ? findSentenceBoundary(content, start, hardEnd) : hardEnd;
    const chunk = content.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (end >= content.length) {
      break;
    }

    let nextStart = Math.max(0, end - overlapChars);
    if (nextStart <= start) {
      nextStart = end;
    }

    while (nextStart < content.length && /\s/.test(content[nextStart])) {
      nextStart += 1;
    }

    start = nextStart;
  }

  return chunks;
}
