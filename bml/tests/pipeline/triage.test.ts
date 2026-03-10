import { beforeEach, describe, expect, it, vi } from 'vitest';
import { triageDocument } from '../../src/pipeline/triage';
import { ClaudeZodValidationError } from '../../src/lib/claude';

const updates: Array<Record<string, unknown>> = [];

const { mockSupabase, mockCallClaude } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(() => ({
      update: vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload);
        return {
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    })),
  },
  mockCallClaude: vi.fn(),
}));

vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase }));
vi.mock('../../src/lib/claude', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/claude')>('../../src/lib/claude');
  return {
    ...actual,
    callClaude: mockCallClaude,
  };
});

describe('triageDocument', () => {
  const rawDoc = {
    id: 'raw-1',
    source_type: 'youtube',
    raw_payload: { title: 'Video' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
  });

  it("document pertinent (0.8) => processing_status 'triaged'", async () => {
    mockCallClaude.mockResolvedValue({
      relevance_score: 0.8,
      business_category: 'contenu',
      summary: 'Résumé',
    });

    const result = await triageDocument(rawDoc);

    expect(result.relevance_score).toBe(0.8);
    expect(updates[0].processing_status).toBe('triaged');
  });

  it("document non pertinent (0.3) => processing_status 'skipped'", async () => {
    mockCallClaude.mockResolvedValue({
      relevance_score: 0.3,
      business_category: 'autre',
      summary: 'Résumé',
    });

    const result = await triageDocument(rawDoc);

    expect(result.relevance_score).toBe(0.3);
    expect(updates[0].processing_status).toBe('skipped');
  });

  it("JSON invalide non récupérable => processing_status 'extraction_failed'", async () => {
    mockCallClaude.mockRejectedValue(new ClaudeZodValidationError('invalid json'));

    await expect(triageDocument(rawDoc)).rejects.toThrow('invalid json');
    expect(updates[0].processing_status).toBe('extraction_failed');
  });
});
