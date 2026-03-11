import { requireSupabaseBrowser } from '@/lib/supabaseBrowser';

export type DealStatus =
  | 'lead'
  | 'qualified'
  | 'call_scheduled'
  | 'proposal_sent'
  | 'won'
  | 'lost';

export type PipelineDeal = {
  id: string;
  contact_id: string;
  offer: string;
  amount: number | null;
  currency: string | null;
  status: DealStatus;
  next_action: string | null;
  next_action_date: string | null;
  created_at: string;
  contact: {
    id: string;
    name: string;
    company: string | null;
  } | null;
};

type DealUpdate = Partial<{
  offer: string;
  amount: number | null;
  currency: string;
  status: DealStatus;
  next_action: string | null;
  next_action_date: string | null;
}>;

export async function getDealsWithContacts(): Promise<PipelineDeal[]> {
  const supabaseBrowser = requireSupabaseBrowser();
  const { data, error } = await (supabaseBrowser as any)
    .from('deals')
    .select(
      `
      id,
      contact_id,
      offer,
      amount,
      currency,
      status,
      next_action,
      next_action_date,
      created_at,
      contacts:contact_id (
        id,
        name,
        company
      )
    `,
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Impossible de charger les deals: ${error.message}`);
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    contact_id: row.contact_id,
    offer: row.offer,
    amount: row.amount,
    currency: row.currency,
    status: (row.status ?? 'lead') as DealStatus,
    next_action: row.next_action,
    next_action_date: row.next_action_date,
    created_at: row.created_at,
    contact: row.contacts
      ? {
          id: row.contacts.id,
          name: row.contacts.name,
          company: row.contacts.company,
        }
      : null,
  }));
}

export async function createDealWithContact(
  contactName: string,
  company: string,
  offer: string,
  amount?: number,
): Promise<PipelineDeal> {
  const supabaseBrowser = requireSupabaseBrowser();
  const { data: contact, error: contactError } = await (supabaseBrowser as any)
    .from('contacts')
    .insert({
      name: contactName,
      company: company || null,
      source: 'manual',
    })
    .select('id, name, company')
    .single();

  if (contactError || !contact?.id) {
    throw new Error(`Impossible de créer le contact: ${contactError?.message ?? 'unknown error'}`);
  }

  const { data: deal, error: dealError } = await (supabaseBrowser as any)
    .from('deals')
    .insert({
      contact_id: contact.id,
      offer,
      amount: typeof amount === 'number' && Number.isFinite(amount) ? amount : null,
      currency: 'EUR',
      status: 'lead',
    })
    .select(
      `
      id,
      contact_id,
      offer,
      amount,
      currency,
      status,
      next_action,
      next_action_date,
      created_at,
      contacts:contact_id (
        id,
        name,
        company
      )
    `,
    )
    .single();

  if (dealError || !deal?.id) {
    throw new Error(`Impossible de créer le deal: ${dealError?.message ?? 'unknown error'}`);
  }

  return {
    id: deal.id,
    contact_id: deal.contact_id,
    offer: deal.offer,
    amount: deal.amount,
    currency: deal.currency,
    status: (deal.status ?? 'lead') as DealStatus,
    next_action: deal.next_action,
    next_action_date: deal.next_action_date,
    created_at: deal.created_at,
    contact: deal.contacts
      ? {
          id: deal.contacts.id,
          name: deal.contacts.name,
          company: deal.contacts.company,
        }
      : null,
  };
}

export async function updateDeal(dealId: string, updates: DealUpdate): Promise<void> {
  const supabaseBrowser = requireSupabaseBrowser();
  const { error } = await (supabaseBrowser as any).from('deals').update(updates).eq('id', dealId);

  if (error) {
    throw new Error(`Impossible de mettre à jour le deal: ${error.message}`);
  }
}

export async function deleteDeal(dealId: string): Promise<void> {
  const supabaseBrowser = requireSupabaseBrowser();
  const { error } = await (supabaseBrowser as any).from('deals').delete().eq('id', dealId);

  if (error) {
    throw new Error(`Impossible de supprimer le deal: ${error.message}`);
  }
}
