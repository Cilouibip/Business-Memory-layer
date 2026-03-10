import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const MODEL_MAP = {
  haiku: 'claude-3-5-haiku-latest',
  sonnet: 'claude-3-5-sonnet-latest',
} as const;

const BACKOFF_MS = [1000, 3000];

export class ClaudeZodValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeZodValidationError';
  }
}

type ClaudeModel = keyof typeof MODEL_MAP;

type CallClaudeOptions<T> = {
  model: ClaudeModel;
  prompt: string;
  zodSchema: z.ZodType<T>;
  maxRetries?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return trimmed;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Claude call timed out after 60 seconds'));
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

export async function callClaude<T>(options: CallClaudeOptions<T>): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing env var: ANTHROPIC_API_KEY');
  }

  const anthropic = new Anthropic({ apiKey });
  const maxRetries = options.maxRetries ?? 2;
  let activePrompt = options.prompt;

  if (process.env.NODE_ENV === 'development') {
    console.log('[callClaude] prompt', activePrompt);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await withTimeout(
        anthropic.messages.create({
          model: MODEL_MAP[options.model],
          max_tokens: 4096,
          messages: [{ role: 'user', content: activePrompt }],
        }),
        60_000,
      );

      const responseText = response.content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('')
        .trim();

      if (process.env.NODE_ENV === 'development') {
        console.log('[callClaude] response', responseText);
      }

      const parsedJson = JSON.parse(extractJsonText(responseText));
      const validated = options.zodSchema.safeParse(parsedJson);

      if (validated.success) {
        return validated.data;
      }

      if (attempt >= maxRetries) {
        throw new ClaudeZodValidationError(validated.error.message);
      }

      activePrompt = `${options.prompt}\n\nTa réponse précédente n'était pas du JSON valide. Voici l'erreur Zod : ${validated.error.message}. Corrige et renvoie uniquement du JSON valide.`;
      await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
    } catch (error) {
      if (error instanceof ClaudeZodValidationError) {
        throw error;
      }

      if (attempt >= maxRetries) {
        throw error;
      }

      await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
    }
  }

  throw new Error('Claude call failed after retries');
}
