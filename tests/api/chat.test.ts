import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() },
}));

vi.mock('../../src/lib/supabase', () => ({
  supabase: mockSupabase,
}));

type ContactRow = {
  id: string;
  name: string;
  company: string | null;
  source: string | null;
  notes: string | null;
};

type DealRow = {
  id: string;
  contact_id: string | null;
  offer: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  next_action: string | null;
  next_action_date: string | null;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  deal_id: string;
  activity_type: string;
  description: string;
};

type State = {
  contacts: ContactRow[];
  deals: DealRow[];
  activities: ActivityRow[];
};

function createState(): State {
  return {
    contacts: [],
    deals: [],
    activities: [],
  };
}

function wireSupabaseMock(state: State): void {
  let sequence = 1;
  const nextId = (prefix: string) => `${prefix}-${sequence++}`;

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'contacts') {
      const filters: Record<string, unknown> = {};
      let inserted: Array<Record<string, unknown>> | null = null;

      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        }),
        insert: vi.fn((rows: Array<Record<string, unknown>>) => {
          inserted = rows;
          return builder;
        }),
        single: vi.fn(async () => {
          if (!inserted || inserted.length === 0) {
            return { data: null, error: { message: 'No insert payload' } };
          }

          const row = inserted[0];
          const created: ContactRow = {
            id: nextId('contact'),
            name: String(row.name),
            company: (row.company as string | null) ?? null,
            source: (row.source as string | null) ?? null,
            notes: (row.notes as string | null) ?? null,
          };

          state.contacts.push(created);
          return { data: created, error: null };
        }),
        then: (resolve: (value: { data: ContactRow[]; error: null }) => void) => {
          let rows = [...state.contacts];
          if (filters.id) {
            rows = rows.filter((row) => row.id === filters.id);
          }
          resolve({ data: rows, error: null });
        },
      };

      return builder;
    }

    if (table === 'deals') {
      const filters: Record<string, unknown> = {};
      let inserted: Array<Record<string, unknown>> | null = null;
      let patch: Record<string, unknown> | null = null;
      let requiresNotNullNextActionDate = false;
      let beforeDate: string | null = null;
      let allowedStatuses: string[] | null = null;
      let orderByUpdatedAtDesc = false;
      let limitCount: number | null = null;

      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        }),
        order: vi.fn((field: string, opts: { ascending: boolean }) => {
          if (field === 'updated_at' && opts.ascending === false) {
            orderByUpdatedAtDesc = true;
          }
          return builder;
        }),
        limit: vi.fn((value: number) => {
          limitCount = value;
          return builder;
        }),
        insert: vi.fn((rows: Array<Record<string, unknown>>) => {
          inserted = rows;
          return builder;
        }),
        update: vi.fn((value: Record<string, unknown>) => {
          patch = value;
          return builder;
        }),
        not: vi.fn((field: string, op: string, value: unknown) => {
          if (field === 'next_action_date' && op === 'is' && value === null) {
            requiresNotNullNextActionDate = true;
          }
          return builder;
        }),
        lt: vi.fn((field: string, value: string) => {
          if (field === 'next_action_date') {
            beforeDate = value;
          }
          return builder;
        }),
        in: vi.fn((field: string, values: string[]) => {
          if (field === 'status') {
            allowedStatuses = values;
          }
          return builder;
        }),
        single: vi.fn(async () => {
          if (inserted && inserted.length > 0) {
            const row = inserted[0];
            const created: DealRow = {
              id: nextId('deal'),
              contact_id: (row.contact_id as string | null) ?? null,
              offer: String(row.offer),
              amount: (row.amount as number | null) ?? null,
              currency: (row.currency as string | null) ?? 'EUR',
              status: (row.status as string | null) ?? 'lead',
              next_action: (row.next_action as string | null) ?? null,
              next_action_date: (row.next_action_date as string | null) ?? null,
              updated_at: new Date().toISOString(),
            };
            state.deals.push(created);
            return { data: created, error: null };
          }

          if (patch && filters.id) {
            const index = state.deals.findIndex((row) => row.id === filters.id);
            if (index === -1) {
              return { data: null, error: { message: 'Deal not found' } };
            }

            const updated: DealRow = {
              ...state.deals[index],
              ...patch,
              updated_at: new Date().toISOString(),
            } as DealRow;
            state.deals[index] = updated;
            return { data: updated, error: null };
          }

          return { data: null, error: { message: 'Unsupported operation' } };
        }),
        then: (resolve: (value: { data: DealRow[]; error: null }) => void) => {
          let rows = [...state.deals];

          if (filters.contact_id) {
            rows = rows.filter((row) => row.contact_id === filters.contact_id);
          }

          if (requiresNotNullNextActionDate) {
            rows = rows.filter((row) => row.next_action_date !== null);
          }

          if (beforeDate) {
            const cutoff = beforeDate;
            rows = rows.filter((row) => row.next_action_date !== null && row.next_action_date < cutoff);
          }

          if (allowedStatuses) {
            rows = rows.filter((row) => row.status !== null && allowedStatuses!.includes(row.status));
          }

          if (orderByUpdatedAtDesc) {
            rows = rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
          }

          if (limitCount !== null) {
            rows = rows.slice(0, limitCount);
          }

          resolve({ data: rows, error: null });
        },
      };

      return builder;
    }

    if (table === 'activities') {
      let inserted: Array<Record<string, unknown>> | null = null;

      const builder: any = {
        insert: vi.fn((rows: Array<Record<string, unknown>>) => {
          inserted = rows;
          return builder;
        }),
        select: vi.fn(() => builder),
        single: vi.fn(async () => {
          if (!inserted || inserted.length === 0) {
            return { data: null, error: { message: 'No insert payload' } };
          }

          const row = inserted[0];
          const created: ActivityRow = {
            id: nextId('activity'),
            deal_id: String(row.deal_id),
            activity_type: String(row.activity_type),
            description: String(row.description),
          };
          state.activities.push(created);
          return { data: created, error: null };
        }),
      };

      return builder;
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe('CRM chat tools backend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create_contact crée un contact en base', async () => {
    const state = createState();
    wireSupabaseMock(state);

    const { createContact } = await import('../../src/lib/crmQueries');
    const contact = await createContact({
      name: 'Sophie',
      company: 'Digitale',
      source: 'call',
      notes: 'Intéressée',
    });

    expect(contact.name).toBe('Sophie');
    expect(state.contacts).toHaveLength(1);
    expect(state.contacts[0].company).toBe('Digitale');
  });

  it('create_deal avec fuzzy match trouve le bon contact', async () => {
    const state = createState();
    state.contacts.push({
      id: 'contact-1',
      name: 'Sophie Martin',
      company: 'Digitale',
      source: 'linkedin',
      notes: null,
    });
    wireSupabaseMock(state);

    const { createDealByContactName } = await import('../../src/lib/crmQueries');
    const result = await createDealByContactName({
      contact_name: 'sophie',
      offer: 'Machine à Revenus',
      amount: 3000,
    });

    expect(result.status).toBe('created');
    expect(state.deals).toHaveLength(1);
    expect(state.deals[0].contact_id).toBe('contact-1');
    expect(state.contacts).toHaveLength(1);
  });

  it('get_pipeline_summary retourne le bon format', async () => {
    const state = createState();
    state.deals.push(
      {
        id: 'deal-1',
        contact_id: 'contact-1',
        offer: 'Offre A',
        amount: 1000,
        currency: 'EUR',
        status: 'lead',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-03-11T08:00:00Z',
      },
      {
        id: 'deal-2',
        contact_id: 'contact-2',
        offer: 'Offre B',
        amount: 2500,
        currency: 'EUR',
        status: 'qualified',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-03-11T08:01:00Z',
      },
      {
        id: 'deal-3',
        contact_id: 'contact-3',
        offer: 'Offre C',
        amount: 3000,
        currency: 'EUR',
        status: 'proposal',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-03-11T08:02:00Z',
      },
      {
        id: 'deal-4',
        contact_id: 'contact-4',
        offer: 'Offre D',
        amount: 5000,
        currency: 'EUR',
        status: 'won',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-03-11T08:03:00Z',
      },
    );
    wireSupabaseMock(state);

    const { getPipelineSummary } = await import('../../src/lib/crmQueries');
    const summary = await getPipelineSummary();

    expect(summary).toEqual({
      leads: 1,
      qualified: 1,
      proposals: 1,
      won: 1,
      revenue: 5000,
    });
  });

  it('get_overdue_actions retourne les deals en retard', async () => {
    const state = createState();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    state.deals.push(
      {
        id: 'deal-overdue',
        contact_id: 'contact-1',
        offer: 'Offre en retard',
        amount: 1200,
        currency: 'EUR',
        status: 'lead',
        next_action: 'Relancer',
        next_action_date: yesterday,
        updated_at: '2026-03-11T08:00:00Z',
      },
      {
        id: 'deal-future',
        contact_id: 'contact-2',
        offer: 'Offre future',
        amount: 1400,
        currency: 'EUR',
        status: 'lead',
        next_action: 'Appel',
        next_action_date: tomorrow,
        updated_at: '2026-03-11T08:01:00Z',
      },
    );
    wireSupabaseMock(state);

    const { getOverdueActions } = await import('../../src/lib/crmQueries');
    const overdue = await getOverdueActions();

    expect(overdue).toHaveLength(1);
    expect(overdue[0].id).toBe('deal-overdue');
  });
});
