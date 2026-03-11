import { supabase } from './supabase';
import { getAllLinkedInPosts } from './linkedinAnalytics';
import { getAllVideos, getYouTubeWeeklyViews } from './youtubeAnalytics';

export type PipelineBusinessSummary = {
  leads: number;
  inProgress: number;
  proposals: number;
  wonThisMonthRevenue: number;
};

export type TodoTask = {
  type: 'overdue_action' | 'no_next_action' | 'publish_reminder';
  title: string;
  subtitle: string;
  priority: 'high' | 'medium' | 'low';
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

function isActiveDeal(status: string | null | undefined): boolean {
  return status !== 'won' && status !== 'lost';
}

function formatDaysAgo(days: number): string {
  if (days <= 1) return 'il y a 1 jour';
  return `il y a ${days} jours`;
}

export async function getTodayTasks(): Promise<TodoTask[]> {
  const tasks: TodoTask[] = [];
  const todayIsoDate = new Date().toISOString().slice(0, 10);

  const { data: dealsData, error: dealsError } = await (supabase as any)
    .from('deals')
    .select(
      `
      status,
      next_action,
      next_action_date,
      contacts:contact_id (
        name
      )
    `,
    );

  if (dealsError) {
    throw new Error(`Erreur lors de la récupération des tâches pipeline: ${dealsError.message}`);
  }

  const deals = (dealsData ?? []) as Array<{
    status?: string | null;
    next_action?: string | null;
    next_action_date?: string | null;
    contacts?: { name?: string | null } | null;
  }>;

  for (const deal of deals) {
    if (!isActiveDeal(deal.status)) continue;
    const contactName = deal.contacts?.name?.trim() || 'contact sans nom';
    const nextAction = deal.next_action?.trim() || 'action non définie';
    const nextActionDate = (deal.next_action_date ?? '').slice(0, 10);

    if (nextActionDate && nextActionDate < todayIsoDate) {
      tasks.push({
        type: 'overdue_action',
        title: `Relance en retard : ${contactName} — ${nextAction}`,
        subtitle: `Échéance: ${nextActionDate}`,
        priority: 'high',
      });
      continue;
    }

    if (!deal.next_action || !deal.next_action.trim()) {
      tasks.push({
        type: 'no_next_action',
        title: `Définir prochaine action pour ${contactName}`,
        subtitle: 'Aucune prochaine action renseignée',
        priority: 'medium',
      });
    }
  }

  const { data: latestLinkedInDoc, error: latestLinkedInError } = await (supabase as any)
    .from('raw_documents')
    .select('created_at')
    .eq('source_type', 'linkedin')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestLinkedInError && latestLinkedInDoc?.created_at) {
    const lastPostDate = new Date(latestLinkedInDoc.created_at);
    const daysSince = Math.floor((Date.now() - lastPostDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince > 3) {
      tasks.push({
        type: 'publish_reminder',
        title: 'Publier un post LinkedIn',
        subtitle: `Dernier post ${formatDaysAgo(daysSince)}`,
        priority: 'medium',
      });
    }
  }

  return tasks;
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