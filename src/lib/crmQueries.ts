import { supabase } from './supabase';

type Contact = {
  id: string;
  name: string;
  company: string | null;
  source: string | null;
  notes: string | null;
};

type Deal = {
  id: string;
  contact_id: string | null;
  offer: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  next_action: string | null;
  next_action_date: string | null;
};

type ContactMatch =
  | { status: 'single'; contact: Contact }
  | { status: 'multiple'; matches: Contact[] }
  | { status: 'none'; created_contact: Contact };

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isFuzzyMatch(query: string, candidate: string): boolean {
  const q = normalize(query);
  const c = normalize(candidate);
  return c.includes(q) || q.includes(c);
}

async function getAllContacts(): Promise<Contact[]> {
  const { data, error } = await (supabase as any)
    .from('contacts')
    .select('id,name,company,source,notes');

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Contact[];
}

async function resolveContactByName(contactName: string): Promise<ContactMatch> {
  const contacts = await getAllContacts();
  const matches = contacts.filter((contact) => isFuzzyMatch(contactName, contact.name));

  if (matches.length > 1) {
    return { status: 'multiple', matches };
  }

  if (matches.length === 1) {
    return { status: 'single', contact: matches[0] };
  }

  const created = await createContact({ name: contactName, source: 'chat' });
  return { status: 'none', created_contact: created };
}

export async function createContact(input: {
  name: string;
  company?: string;
  source?: string;
  notes?: string;
}): Promise<Contact> {
  const { data, error } = await (supabase as any)
    .from('contacts')
    .insert([
      {
        name: input.name,
        company: input.company ?? null,
        source: input.source ?? 'chat',
        notes: input.notes ?? null,
      },
    ])
    .select('id,name,company,source,notes')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Contact;
}

export async function createDealByContactName(input: {
  contact_name: string;
  offer: string;
  amount?: number;
  status?: string;
}) {
  const contactResolution = await resolveContactByName(input.contact_name);

  if (contactResolution.status === 'multiple') {
    return {
      status: 'multiple_matches',
      matches: contactResolution.matches,
    };
  }

  const contact =
    contactResolution.status === 'single'
      ? contactResolution.contact
      : contactResolution.created_contact;

  const { data, error } = await (supabase as any)
    .from('deals')
    .insert([
      {
        contact_id: contact.id,
        offer: input.offer,
        amount: input.amount ?? null,
        status: input.status ?? 'lead',
      },
    ])
    .select('id,contact_id,offer,amount,currency,status,next_action,next_action_date')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: 'created',
    contact,
    deal: data as Deal,
    contact_created: contactResolution.status === 'none',
  };
}

export async function updateDealByContactName(input: {
  contact_name: string;
  status?: string;
  next_action?: string;
  next_action_date?: string;
  amount?: number;
}) {
  const contactResolution = await resolveContactByName(input.contact_name);

  if (contactResolution.status === 'multiple') {
    return {
      status: 'multiple_matches',
      matches: contactResolution.matches,
    };
  }

  const contact =
    contactResolution.status === 'single'
      ? contactResolution.contact
      : contactResolution.created_contact;

  const { data: deals, error: dealsError } = await (supabase as any)
    .from('deals')
    .select('id,contact_id,offer,amount,currency,status,next_action,next_action_date')
    .eq('contact_id', contact.id)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (dealsError) {
    throw new Error(dealsError.message);
  }

  const targetDeal = (deals ?? [])[0] as Deal | undefined;
  if (!targetDeal) {
    return {
      status: 'no_deal_found',
      contact,
      contact_created: contactResolution.status === 'none',
    };
  }

  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.next_action !== undefined) patch.next_action = input.next_action;
  if (input.next_action_date !== undefined) patch.next_action_date = input.next_action_date;
  if (input.amount !== undefined) patch.amount = input.amount;

  const { data, error } = await (supabase as any)
    .from('deals')
    .update(patch)
    .eq('id', targetDeal.id)
    .select('id,contact_id,offer,amount,currency,status,next_action,next_action_date')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: 'updated',
    contact,
    deal: data as Deal,
  };
}

export async function logActivityByContactName(input: {
  contact_name: string;
  type: string;
  description: string;
}) {
  const contactResolution = await resolveContactByName(input.contact_name);

  if (contactResolution.status === 'multiple') {
    return {
      status: 'multiple_matches',
      matches: contactResolution.matches,
    };
  }

  const contact =
    contactResolution.status === 'single'
      ? contactResolution.contact
      : contactResolution.created_contact;

  const { data: deals, error: dealsError } = await (supabase as any)
    .from('deals')
    .select('id')
    .eq('contact_id', contact.id)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (dealsError) {
    throw new Error(dealsError.message);
  }

  let dealId = (deals ?? [])[0]?.id as string | undefined;

  if (!dealId) {
    const { data: createdDeal, error: createDealError } = await (supabase as any)
      .from('deals')
      .insert([{ contact_id: contact.id, offer: 'General follow-up', status: 'lead' }])
      .select('id')
      .single();

    if (createDealError) {
      throw new Error(createDealError.message);
    }

    dealId = createdDeal.id;
  }

  const { data, error } = await (supabase as any)
    .from('activities')
    .insert([
      {
        deal_id: dealId,
        activity_type: input.type,
        description: input.description,
      },
    ])
    .select('id,deal_id,activity_type,description')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: 'logged',
    contact,
    activity: data,
  };
}

export async function getPipelineSummary() {
  const { data, error } = await (supabase as any)
    .from('deals')
    .select('status, amount');

  if (error) {
    throw new Error(error.message);
  }

  const deals = (data ?? []) as Array<{ status: string | null; amount: number | null }>;

  const summary = {
    leads: 0,
    qualified: 0,
    proposals: 0,
    won: 0,
    revenue: 0,
  };

  for (const deal of deals) {
    const status = (deal.status ?? '').toLowerCase();
    if (status === 'lead') summary.leads += 1;
    if (status === 'qualified') summary.qualified += 1;
    if (status === 'proposal' || status === 'proposals') summary.proposals += 1;
    if (status === 'won') {
      summary.won += 1;
      summary.revenue += Number(deal.amount ?? 0);
    }
  }

  return summary;
}

export async function getOverdueActions() {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await (supabase as any)
    .from('deals')
    .select('id,contact_id,offer,amount,currency,status,next_action,next_action_date')
    .not('next_action_date', 'is', null)
    .lt('next_action_date', today)
    .in('status', ['lead', 'qualified', 'proposal']);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
