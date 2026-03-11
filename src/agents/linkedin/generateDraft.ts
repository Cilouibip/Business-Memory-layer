import { z } from 'zod';
import { searchMemory } from '../../lib/memoryQueries';
import { callClaude } from '../../lib/claude';
import { supabase } from '../../lib/supabase';
import { buildExtractorPrompt, buildWriterPromptV2 } from './prompts';

const STYLES = ['mentor', 'contrarian', 'story', 'analyst'] as const;

type DraftStyle = (typeof STYLES)[number];

type TavilyItem = {
  title: string;
  url: string;
  content: string;
};

const LinkedInDraftSchema = z.object({
  content: z.string().min(800).max(1500),
});

const ExtractorSchema = z.object({
  thesis: z.string().default(''),
  tensions: z.array(z.string()).default([]),
  angles: z
    .array(
      z.object({
        type: z.string().default(''),
        claim: z.string().default(''),
        why_it_matters: z.string().default(''),
      }),
    )
    .default([]),
  framework: z
    .object({
      name: z.string().default(''),
      promise: z.string().default(''),
      steps: z.array(z.object({ action: z.string().default(''), detail: z.string().default('') })).default([]),
    })
    .default({ name: '', promise: '', steps: [] }),
  story: z
    .object({
      context: z.string().default(''),
      pain: z.string().default(''),
      turning_point: z.string().default(''),
      result: z.string().default(''),
      moral: z.string().default(''),
    })
    .default({ context: '', pain: '', turning_point: '', result: '', moral: '' }),
  copy_ammo: z
    .object({
      hook_seeds: z.array(z.string()).default([]),
      punchlines: z.array(z.string()).default([]),
    })
    .default({ hook_seeds: [], punchlines: [] }),
  grounding: z
    .object({
      facts: z.array(z.string()).default([]),
      evidence_snippets: z.array(z.string()).default([]),
    })
    .default({ facts: [], evidence_snippets: [] }),
});

const WriterV2Schema = z.object({
  posts: z
    .array(
      z.object({
        content: z.string().min(800).max(1500),
        hookType: z.string().optional(),
        angleId: z.string().optional(),
        wordCount: z.number().optional(),
      }),
    )
    .min(1),
});

async function getNextStyle(workspaceId: string): Promise<DraftStyle> {
  const { data } = await (supabase as any)
    .from('linkedin_drafts')
    .select('style')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastStyle = (data?.style ?? '') as string;
  const index = STYLES.findIndex((style) => style === lastStyle);
  if (index === -1) {
    return STYLES[0];
  }
  return STYLES[(index + 1) % STYLES.length];
}

async function safeSearch(query: string, limit: number) {
  try {
    return await searchMemory(query, undefined, limit);
  } catch {
    return [];
  }
}

async function fetchTavilyNews(): Promise<TavilyItem[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return [];
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: 'IA business RevOps solopreneuriat storytelling B2B dernières news',
      max_results: 5,
      search_depth: 'advanced',
    }),
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results : [];

  return results.slice(0, 5).map((item: any) => ({
    title: typeof item?.title === 'string' ? item.title : 'Sans titre',
    url: typeof item?.url === 'string' ? item.url : '',
    content: typeof item?.content === 'string' ? item.content : '',
  }));
}

function summarizeMemoryRows(rows: any[], limit: number) {
  return rows.slice(0, limit).map((row) => ({
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    score: row.score,
    chunk_text: row.chunk_text,
    metadata: row.metadata,
  }));
}

export async function generateDraft(workspaceId = 'personal') {
  const runId = `linkedin-draft-${Date.now()}`;
  const startedAt = Date.now();
  const style = await getNextStyle(workspaceId);

  try {
    const [youtubeRows, news] = await Promise.all([
      safeSearch('3 dernières vidéos YouTube de Mehdi Benchaffi', 6),
      fetchTavilyNews(),
    ]);

    const memoryRows = summarizeMemoryRows(youtubeRows, 3);
    const transcriptSource = memoryRows.map((row) => String(row.chunk_text ?? '')).join('\n\n');
    const extractionPrompt = `${buildExtractorPrompt()}\n\n# TRANSCRIPT\n${transcriptSource}`;
    const extraction = await callClaude({
      model: 'sonnet',
      prompt: extractionPrompt,
      zodSchema: ExtractorSchema,
      maxRetries: 2,
    });

    const selectedAngles = extraction.angles.slice(0, 3).map((angle, idx) => ({
      id: `angle_${idx + 1}`,
      type: angle.type,
      claim: angle.claim,
      hook_draft: extraction.copy_ammo.hook_seeds[idx] ?? '',
      evidence: extraction.grounding.evidence_snippets[idx] ?? '',
      tension: extraction.tensions[idx] ?? '',
    }));

    const writerPrompt = [
      buildWriterPromptV2(style, 'engagement', selectedAngles),
      '',
      '# EXTRACTION_JSON',
      JSON.stringify(extraction),
      '',
      '# NEWS_JSON',
      news.length > 0 ? JSON.stringify(news) : '[]',
      '',
      '# SORTIE',
      'Réponds UNIQUEMENT en JSON valide.',
    ].join('\n');

    const written = await callClaude({
      model: 'sonnet',
      prompt: writerPrompt,
      zodSchema: WriterV2Schema,
      maxRetries: 2,
    });

    const selectedContent = written.posts[0]?.content ?? '';
    const validated = LinkedInDraftSchema.safeParse({ content: selectedContent });
    if (!validated.success) {
      throw new Error(`Draft LinkedIn invalide: ${validated.error.message}`);
    }

    const insertPayload = {
      workspace_id: workspaceId,
      content: validated.data.content,
      style,
      sources: { memoryRows, extraction },
      news_used: news,
      status: 'pending',
    };

    const { data, error } = await (supabase as any)
      .from('linkedin_drafts')
      .insert(insertPayload)
      .select('id, workspace_id, content, style, sources, news_used, status, created_at')
      .single();

    if (error) {
      throw new Error(`Impossible d'insérer le draft LinkedIn: ${error.message}`);
    }

    console.log({
      source: 'linkedin_agent',
      run_id: runId,
      duration_ms: Date.now() - startedAt,
      status: 'success',
      style,
      workspace_id: workspaceId,
    });

    return data;
  } catch (error) {
    console.error({
      source: 'linkedin_agent',
      run_id: runId,
      duration_ms: Date.now() - startedAt,
      status: 'error',
      message: error instanceof Error ? error.message : 'Unexpected error',
      workspace_id: workspaceId,
    });
    throw error;
  }
}
