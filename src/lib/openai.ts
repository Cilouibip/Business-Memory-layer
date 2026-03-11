import OpenAI from 'openai';

const BACKOFF_MS = [1000, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('OpenAI embedding call timed out after 60 seconds'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing env var: OPENAI_API_KEY');
  }

  const input = text.trim();
  if (!input) {
    return [];
  }

  const openai = new OpenAI({ apiKey });
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await withTimeout(
        openai.embeddings.create({
          model: 'text-embedding-3-small',
          input,
        }),
        60_000,
      );

      const embedding = response.data?.[0]?.embedding;
      if (!embedding || embedding.length === 0) {
        throw new Error('OpenAI returned an empty embedding');
      }

      return embedding;
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }

      await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
    }
  }

  throw new Error('OpenAI embedding call failed after retries');
}
