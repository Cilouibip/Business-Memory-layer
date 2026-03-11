import { supabase } from './supabase';

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