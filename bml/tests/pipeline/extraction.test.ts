import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractDocument } from '../../src/pipeline/extraction';

type CanonicalRow = Record<string, unknown> & { id: string; raw_document_id: string };

type State = {
  content_items: CanonicalRow[];
  offers: CanonicalRow[];
  entities: CanonicalRow[];
  business_facts: Array<Record<string, unknown>>;
  relationship_edges: Array<Record<string, unknown>>;
  raw_documents: Array<Record<string, unknown>>;
};

const { mockCallClaude, mockSupabase } = vi.hoisted(() => ({
  mockCallClaude: vi.fn(),
  mockSupabase: { from: vi.fn() },
}));

vi.mock('../../src/lib/claude', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/claude')>('../../src/lib/claude');
  return {
    ...actual,
    callClaude: mockCallClaude,
  };
});
vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase }));

function createState(): State {
  return {
    content_items: [],
    offers: [],
    entities: [],
    business_facts: [],
    relationship_edges: [],
    raw_documents: [],
  };
}

function wireSupabaseMock(state: State) {
  let idCounter = 0;

  mockSupabase.from.mockImplementation((table: keyof State | 'raw_documents') => {
    const filters: Record<string, unknown> = {};
    let isNullField: string | null = null;
    let updatePayload: Record<string, unknown> | null = null;

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((field: string, value: unknown) => {
        filters[field] = value;

        if (updatePayload && (table === 'business_facts' || table === 'raw_documents')) {
          const target = (state as any)[table] as Array<Record<string, unknown>>;
          const idx = target.findIndex((row) => row[field] === value);
          if (idx >= 0) {
            target[idx] = { ...target[idx], ...updatePayload };
          }
          return Promise.resolve({ error: null });
        }

        return builder;
      }),
      is: vi.fn((field: string) => {
        isNullField = field;
        return builder;
      }),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(async () => {
        if (table === 'business_facts') {
          const row = state.business_facts.find((fact) => {
            return (
              fact.domain === filters.domain &&
              fact.source_entity_type === filters.source_entity_type &&
              fact.source_entity_id === filters.source_entity_id &&
              fact.fact_type === filters.fact_type &&
              (!isNullField || fact[isNullField] === null)
            );
          });

          if (row) {
            return { data: row, error: null };
          }

          return { data: null, error: { code: 'PGRST116' } };
        }

        return { data: null, error: { code: 'PGRST116' } };
      }),
      upsert: vi.fn((payload: Record<string, unknown>) => {
        if (table === 'content_items' || table === 'offers' || table === 'entities') {
          const target = state[table] as CanonicalRow[];
          let row = target.find((item) => item.raw_document_id === payload.raw_document_id);

          if (!row) {
            idCounter += 1;
            row = { ...payload, id: `${table}-${idCounter}` } as CanonicalRow;
            target.push(row);
          } else {
            Object.assign(row, payload);
          }

          return {
            select: () => ({
              single: async () => ({ data: { id: row.id }, error: null }),
            }),
          };
        }

        return {
          select: () => ({
            single: async () => ({ data: null, error: { code: 'PGRST116' } }),
          }),
        };
      }),
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        if (table === 'business_facts' || table === 'relationship_edges' || table === 'raw_documents') {
          idCounter += 1;
          (state as any)[table].push({ id: `${table}-${idCounter}`, ...payload });
        }
        return { error: null };
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        updatePayload = payload;
        return builder;
      }),
    };

    return builder;
  });
}

describe('extractDocument', () => {
  const rawDoc = {
    id: 'raw-1',
    source_type: 'youtube',
    raw_payload: { title: 'Video' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("document 'contenu' crée un content_item + business_facts", async () => {
    const state = createState();
    wireSupabaseMock(state);

    mockCallClaude.mockResolvedValue({
      content_item: {
        title: 'Video 1',
        platform: 'youtube',
        url: 'https://youtube.com/watch?v=1',
        publish_date: '2026-03-10T10:00:00Z',
        topic: 'storytelling',
        summary: 'Résumé',
        tags: ['storytelling'],
      },
      business_facts: [
        {
          fact_type: 'positioning',
          fact_text: 'Positionnement premium',
          domain: 'offre',
          confidence_score: 0.9,
        },
      ],
      relationships: [],
    });

    await extractDocument(rawDoc, { business_category: 'contenu', summary: 'summary' });

    expect(state.content_items).toHaveLength(1);
    expect(state.business_facts).toHaveLength(1);
  });

  it("document 'offre' crée une offer + business_facts", async () => {
    const state = createState();
    wireSupabaseMock(state);

    mockCallClaude.mockResolvedValue({
      offer: {
        name: 'Offre 1',
        description: 'Description',
        price: 1000,
        currency: 'EUR',
        target_audience: 'Freelances',
        sales_model: 'one-shot',
        status: 'active',
      },
      business_facts: [
        {
          fact_type: 'price',
          fact_text: 'Prix 1000 EUR',
          domain: 'offre',
          confidence_score: 0.95,
        },
      ],
      relationships: [],
    });

    await extractDocument(rawDoc, { business_category: 'offre', summary: 'summary' });

    expect(state.offers).toHaveLength(1);
    expect(state.business_facts).toHaveLength(1);
  });

  it('changer le prix crée un nouveau fait et ferme l\'ancien', async () => {
    const state = createState();
    wireSupabaseMock(state);

    mockCallClaude
      .mockResolvedValueOnce({
        offer: {
          name: 'Offre 1',
          description: 'Description',
          price: 1000,
          currency: 'EUR',
          target_audience: 'Freelances',
          sales_model: 'one-shot',
          status: 'active',
        },
        business_facts: [
          {
            fact_type: 'price',
            fact_text: 'Prix 1000 EUR',
            domain: 'offre',
            confidence_score: 0.95,
          },
        ],
        relationships: [],
      })
      .mockResolvedValueOnce({
        offer: {
          name: 'Offre 1',
          description: 'Description',
          price: 1200,
          currency: 'EUR',
          target_audience: 'Freelances',
          sales_model: 'one-shot',
          status: 'active',
        },
        business_facts: [
          {
            fact_type: 'price',
            fact_text: 'Prix 1200 EUR',
            domain: 'offre',
            confidence_score: 0.95,
          },
        ],
        relationships: [],
      });

    await extractDocument(rawDoc, { business_category: 'offre', summary: 'summary' });
    await extractDocument(rawDoc, { business_category: 'offre', summary: 'summary' });

    const activeFacts = state.business_facts.filter((fact) => fact.valid_until === null);
    const closedFacts = state.business_facts.filter((fact) => fact.valid_until !== null);

    expect(state.business_facts).toHaveLength(2);
    expect(activeFacts).toHaveLength(1);
    expect(closedFacts).toHaveLength(1);
  });

  it('relancer la même extraction ne crée pas de doublons', async () => {
    const state = createState();
    wireSupabaseMock(state);

    mockCallClaude.mockResolvedValue({
      content_item: {
        title: 'Video 1',
        platform: 'youtube',
        url: 'https://youtube.com/watch?v=1',
        publish_date: '2026-03-10T10:00:00Z',
        topic: 'storytelling',
        summary: 'Résumé',
        tags: ['storytelling'],
      },
      business_facts: [
        {
          fact_type: 'positioning',
          fact_text: 'Positionnement premium',
          domain: 'offre',
          confidence_score: 0.9,
        },
      ],
      relationships: [],
    });

    await extractDocument(rawDoc, { business_category: 'contenu', summary: 'summary' });
    await extractDocument(rawDoc, { business_category: 'contenu', summary: 'summary' });

    expect(state.content_items).toHaveLength(1);
    expect(state.business_facts).toHaveLength(1);
  });
});
