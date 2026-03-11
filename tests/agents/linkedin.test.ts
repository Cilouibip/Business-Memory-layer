import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSearchMemory,
  mockCallClaude,
  mockFrom,
} = vi.hoisted(() => ({
  mockSearchMemory: vi.fn(),
  mockCallClaude: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../../src/lib/memoryQueries', () => ({
  searchMemory: mockSearchMemory,
}));

vi.mock('../../src/lib/claude', () => ({
  callClaude: mockCallClaude,
}));

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}));

describe('LinkedIn draft agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.TAVILY_API_KEY;
  });

  it('buildExtractorPrompt retourne un string non vide', async () => {
    const { buildExtractorPrompt } = await import('../../src/agents/linkedin/prompts');
    const prompt = buildExtractorPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('buildWriterPromptV2 contient le ton demandé', async () => {
    const { buildWriterPromptV2 } = await import('../../src/agents/linkedin/prompts');
    const prompt = buildWriterPromptV2('mentor', 'engagement');
    expect(prompt).toContain('LE TON : MENTOR');
  });

  it('generateDraft retourne un draft avec content et style', async () => {
    mockSearchMemory.mockResolvedValue([{ entity_type: 'content_item', entity_id: 'yt-1', score: 0.9, chunk_text: 'Vidéo 1', metadata: {} }]);

    mockCallClaude.mockResolvedValue({
      thesis: 'thèse',
      tensions: ['On pense A → réalité B'],
      angles: [{ type: 'mentor', claim: 'claim', why_it_matters: 'matters' }],
      framework: { name: '', promise: '', steps: [] },
      story: { context: '', pain: '', turning_point: '', result: '', moral: '' },
      copy_ammo: { hook_seeds: ['hook'], punchlines: ['punch'] },
      grounding: { facts: ['fact'], evidence_snippets: ['evidence'] },
    });
    mockCallClaude.mockResolvedValueOnce({
      thesis: 'thèse',
      tensions: ['On pense A → réalité B'],
      angles: [{ type: 'mentor', claim: 'claim', why_it_matters: 'matters' }],
      framework: { name: '', promise: '', steps: [] },
      story: { context: '', pain: '', turning_point: '', result: '', moral: '' },
      copy_ammo: { hook_seeds: ['hook'], punchlines: ['punch'] },
      grounding: { facts: ['fact'], evidence_snippets: ['evidence'] },
    });
    mockCallClaude.mockResolvedValueOnce({
      posts: [{ content: 'A'.repeat(850), hookType: 'question', angleId: 'angle_1', wordCount: 170 }],
    });

    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { style: 'mentor' }, error: null });
    const selectStyleBuilder = { eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: maybeSingleMock })) })) })) };

    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'draft-1',
        content: 'A'.repeat(850),
        style: 'contrarian',
      },
      error: null,
    });

    const selectMock = vi.fn(() => ({ single: singleMock }));
    const insertMock = vi.fn(() => ({ select: selectMock }));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'linkedin_drafts') {
        return {
          select: vi.fn(() => selectStyleBuilder),
          insert: insertMock,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const { generateDraft } = await import('../../src/agents/linkedin/generateDraft');
    const draft = await generateDraft();

    expect(typeof draft.content).toBe('string');
    expect(draft.content.length).toBeGreaterThanOrEqual(800);
    expect(typeof draft.style).toBe('string');
    expect(mockFrom).toHaveBeenCalledWith('linkedin_drafts');
    expect(mockCallClaude).toHaveBeenCalledTimes(2);
  });

  it('la route cron retourne 200', async () => {
    process.env.CRON_SECRET = 'cron-secret';

    const mockGenerateDraft = vi.fn().mockResolvedValue({
      id: 'draft-3',
      content: 'C'.repeat(900),
      style: 'opinion tranchée',
    });

    vi.doMock('../../src/agents/linkedin/generateDraft', () => ({
      generateDraft: mockGenerateDraft,
    }));

    const { GET } = await import('../../src/app/api/cron/linkedin/route');

    const request = new Request('http://localhost:3000/api/cron/linkedin', {
      method: 'GET',
      headers: {
        authorization: 'Bearer cron-secret',
      },
    });

    const response = await GET(request as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(mockGenerateDraft).toHaveBeenCalledOnce();
  });
});
