import { supabase } from './supabase';

export async function getPipelineSummary() {
  const { data, error } = await (supabase as any).from('deals').select('status, amount');
  if (error) throw new Error(error.message);

  const deals = (data ?? []) as Array<{ status: string | null; amount: number | null }>;
  const summary = { leads: 0, qualified: 0, proposals: 0, won: 0, revenue: 0 };

  for (const deal of deals) {
    const status = (deal.status ?? '').trim().toLowerCase();
    if (status === 'lead') summary.leads += 1;
    if (status === 'qualified' || status === 'qualification') summary.qualified += 1;
    if (status === 'proposal' || status === 'proposals' || status === 'proposal_sent' || status === 'proposal sent') {
      summary.proposals += 1;
    }
    if (status === 'won') {
      summary.won += 1;
      summary.revenue += Number(deal.amount ?? 0);
    }
  }

  return summary;
}

export async function getOverdueActions() {
  const today = new Date().toISOString().slice(0, 10);
  const actionableStatuses = new Set([
    'lead',
    'qualified',
    'qualification',
    'proposal',
    'proposal_sent',
    'proposal sent',
  ]);
  const { data, error } = await (supabase as any)
    .from('deals')
    .select('id,contact_id,offer,amount,currency,status,next_action,next_action_date')
    .not('next_action_date', 'is', null)
    .lt('next_action_date', today);

  if (error) throw new Error(error.message);
  return (data ?? []).filter((deal: any) =>
    actionableStatuses.has(String(deal.status ?? '').trim().toLowerCase())
  );
}
