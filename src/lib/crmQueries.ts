import { supabase } from './supabase';
import { resolveContactByName, type Contact } from './crmContactResolver';
import { getOverdueActions, getPipelineSummary } from './crmPipelineQueries';
import { createTask } from './taskQueries';

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
  const contactResolution = await resolveContactByName(input.contact_name, (payload) => createContact(payload));

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
  const contactResolution = await resolveContactByName(input.contact_name, (payload) => createContact(payload));

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

  const updatedDeal = data as Deal;
  const dueInDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (input.status === 'won') {
    try {
      await createTask({
        title: `Configurer onboarding ${contact.name}`,
        priority: 'high',
        due_date: dueInDays(3),
        source_type: 'hook',
        related_deal_id: updatedDeal.id,
        related_contact_id: contact.id,
      });
    } catch (e) {
      console.error('[hook] Failed to create onboarding task:', e);
    }
  }

  if (input.status === 'proposal' || input.status === 'proposal_sent') {
    try {
      await createTask({
        title: `Envoyer proposition ${contact.name}`,
        priority: 'high',
        due_date: dueInDays(2),
        source_type: 'hook',
        related_deal_id: updatedDeal.id,
        related_contact_id: contact.id,
      });
    } catch (e) {
      console.error('[hook] Failed to create proposal task:', e);
    }
  }

  return {
    status: 'updated',
    contact,
    deal: updatedDeal,
  };
}

export async function logActivityByContactName(input: {
  contact_name: string;
  type: string;
  description: string;
}) {
  const contactResolution = await resolveContactByName(input.contact_name, (payload) => createContact(payload));

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

export { getOverdueActions, getPipelineSummary };
