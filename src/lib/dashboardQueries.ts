import { supabase } from './supabase';
import { getAllLinkedInPosts } from './linkedinAnalytics';
import { getTodayAndOverdueTasks, type Task } from './taskQueries';
import { getAllVideos, getYouTubeWeeklyViews } from './youtubeAnalytics';

export type PipelineBusinessSummary = {
  leads: number;
  inProgress: number;
  proposals: number;
  wonThisMonthRevenue: number;
};

export type ContentCadence = {
  lastLinkedInAt: string | null;
  lastYoutubeAt: string | null;
  linkedInDaysAgo: number | null;
  youtubeDaysAgo: number | null;
};

export type WeeklyStats = {
  thisWeekViews: number;
  lastWeekViews: number;
  deltaPercent: number;
};

export async function getDashboardStats() {
  // Compter les raw_documents par source
  const { data: rawDocs, error: rawDocsError } = await supabase
    .from('raw_documents')
    .select('source_type, processing_status');

  if (rawDocsError) {
    console.error("Erreur lors du compte des raw_documents", rawDocsError);
  }

  const youtube = rawDocs?.filter((d: any) => d.source_type === 'youtube').length ?? 0;
  const notion = rawDocs?.filter((d: any) => d.source_type === 'notion').length ?? 0;
  const linkedin = rawDocs?.filter((d: any) => d.source_type === 'linkedin').length ?? 0;

  // Compter les faits actifs
  const { count: factsCount, error: factsError } = await supabase
    .from('business_facts')
    .select('*', { count: 'exact', head: true })
    .is('valid_until', null);
    
  if (factsError) {
    console.error("Erreur lors du compte des faits", factsError);
  }

  // Compter les chunks
  const { count: chunksCount, error: chunksError } = await supabase
    .from('memory_chunks')
    .select('*', { count: 'exact', head: true });
    
  if (chunksError) {
    console.error("Erreur lors du compte des chunks", chunksError);
  }

  // Compter les entités
  const { count: entitiesCount, error: entitiesError } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true });
    
  if (entitiesError) {
    console.error("Erreur lors du compte des entités", entitiesError);
  }

  // Obtenir la dernière date de sync (depuis sync_runs)
  const { data: syncRuns, error: syncRunsError } = await supabase
    .from('sync_runs')
    .select('source, status, items_processed, end_time')
    .order('end_time', { ascending: false });

  if (syncRunsError) {
    console.error("Erreur lors de la récupération des sync runs", syncRunsError);
  }

  // Agréger les derniers statuts de sync par source
  const syncStatus: Record<string, any> = {};
  if (syncRuns) {
    const runs = syncRuns as any[];
    const sortedRuns = runs.sort((a: any, b: any) => {
        const dateA = a.end_time ? new Date(a.end_time).getTime() : 0;
        const dateB = b.end_time ? new Date(b.end_time).getTime() : 0;
        return dateB - dateA;
    });

    for (const run of sortedRuns) {
        if (run.source && !syncStatus[run.source]) {
            syncStatus[run.source] = {
                status: run.status,
                items_processed: run.items_processed,
                last_sync: run.end_time
            };
        }
    }
  }

  return {
    sources: { youtube, notion, linkedin },
    syncStatus,
    facts: factsCount ?? 0,
    chunks: chunksCount ?? 0,
    entities: entitiesCount ?? 0,
  };
}

export async function getPipelineBusinessSummary(): Promise<PipelineBusinessSummary> {
  const { data, error } = await (supabase as any)
    .from('deals')
    .select('status, amount, updated_at');

  if (error) {
    throw new Error(`Erreur lors de la récupération du pipeline: ${error.message}`);
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const rows = (data ?? []) as Array<{ status?: string; amount?: number | null; updated_at?: string | null }>;

  let leads = 0;
  let inProgress = 0;
  let proposals = 0;
  let wonThisMonthRevenue = 0;

  for (const row of rows) {
    const status = row.status ?? 'lead';
    if (status === 'lead') leads += 1;
    if (status === 'qualified' || status === 'call_scheduled') inProgress += 1;
    if (status === 'proposal_sent') proposals += 1;

    if (status === 'won' && typeof row.amount === 'number') {
      const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
      if (
        updatedAt &&
        updatedAt.getFullYear() === currentYear &&
        updatedAt.getMonth() === currentMonth
      ) {
        wonThisMonthRevenue += row.amount;
      }
    }
  }

  return { leads, inProgress, proposals, wonThisMonthRevenue };
}

export async function getTodayTasks() {
  const today = new Date().toISOString().slice(0, 10);
  const items: Array<{
    type: 'task' | 'deal_action';
    id: string;
    title: string;
    priority: string;
    due_date: string | null;
    source: string;
  }> = [];

  try {
    const tasks = await getTodayAndOverdueTasks();
    for (const task of tasks as Task[]) {
      items.push({
        type: 'task',
        id: task.id,
        title: task.title,
        priority: task.priority,
        due_date: task.due_date,
        source: task.source_type,
      });
    }
  } catch {}

  try {
    const { data: deals } = await (supabase as any)
      .from('deals')
      .select('id, offer, next_action, next_action_date, status')
      .lte('next_action_date', today)
      .not('next_action_date', 'is', null)
      .in('status', ['lead', 'qualified', 'proposal', 'call_scheduled']);

    for (const deal of deals ?? []) {
      items.push({
        type: 'deal_action',
        id: deal.id,
        title: deal.next_action || `Relance ${deal.offer}`,
        priority: 'high',
        due_date: deal.next_action_date,
        source: 'crm',
      });
    }
  } catch {}

  try {
    const { data: noAction } = await (supabase as any)
      .from('deals')
      .select('id, offer, status')
      .is('next_action', null)
      .in('status', ['lead', 'qualified', 'proposal', 'call_scheduled']);

    for (const deal of noAction ?? []) {
      items.push({
        type: 'deal_action',
        id: deal.id,
        title: `Définir prochaine action pour ${deal.offer}`,
        priority: 'medium',
        due_date: null,
        source: 'crm',
      });
    }
  } catch {}

  const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
  items.sort((a, b) => (priorityOrder[b.priority] ?? 0) - (priorityOrder[a.priority] ?? 0));

  return items;
}

function daysAgoFromIso(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24)));
}

export async function getContentCadence(): Promise<ContentCadence> {
  const [youtubeVideos, linkedInPosts] = await Promise.all([
    getAllVideos(),
    getAllLinkedInPosts(),
  ]);

  const lastYoutubeAt = youtubeVideos[0]?.publishedAt ?? null;
  const lastLinkedInAt = linkedInPosts[0]?.publishedAt ?? null;

  return {
    lastLinkedInAt,
    lastYoutubeAt,
    linkedInDaysAgo: daysAgoFromIso(lastLinkedInAt),
    youtubeDaysAgo: daysAgoFromIso(lastYoutubeAt),
  };
}

export async function getWeeklyStats(): Promise<WeeklyStats> {
  const weekly = await getYouTubeWeeklyViews();
  return {
    thisWeekViews: weekly.thisWeek,
    lastWeekViews: weekly.lastWeek,
    deltaPercent: weekly.deltaPercent,
  };
}