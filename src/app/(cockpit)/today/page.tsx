import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MemorySearchForm } from "@/components/cockpit/MemorySearchForm";
import { DraftFocusCard } from "@/components/cockpit/DraftFocusCard";
import { SyncButton } from "@/components/cockpit/SyncButton";
import { TodayTasksList } from "@/components/cockpit/TodayTasksList";
import { KPICard } from "@/components/cockpit/KPICard";
import { PipelineStackedBar } from "@/components/cockpit/PipelineStackedBar";
import { YouTubeChart } from "@/components/cockpit/YouTubeChart";
import { BmlMemorySearch } from "@/components/cockpit/BmlMemorySearch";
import { ContentCadenceCard } from "@/components/cockpit/ContentCadenceCard";
import { SyncStatusList } from "@/components/cockpit/SyncStatusList";
import { BmlDigestionStateCard } from "@/components/cockpit/BmlDigestionStateCard";
import { LatestInsightsCard } from "@/components/cockpit/LatestInsightsCard";
import { CopilotCommandBar } from "@/components/cockpit/CopilotCommandBar";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, PenTool } from "lucide-react";
import Link from "next/link";
import { getContentCadence, getDashboardStats, getPipelineBusinessSummary, getTodayTasks, getWeeklyStats, getBmlDigestionState, getLatestInsights } from "@/lib/dashboardQueries";
import { getYouTubeBusinessSnapshot } from "@/lib/youtubeAnalytics";
import { getAllLinkedInPosts, type LinkedInPostStats } from "@/lib/linkedinAnalytics";
import { supabase } from "@/lib/supabase";

export default async function TodayPage() {
  const today = new Date();
  const displayDate = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
    .format(today)
    .replace(/^./, (c) => c.toUpperCase());

  const [
    statsResult,
    youtubeResult,
    linkedinResult,
    cadenceResult,
    weeklyResult,
    pipelineResult,
    tasksResult,
    draftResult,
    digestionResult,
    insightsResult
  ] = await Promise.allSettled([
    getDashboardStats(),
    getYouTubeBusinessSnapshot(),
    getAllLinkedInPosts(),
    getContentCadence(),
    getWeeklyStats(),
    getPipelineBusinessSummary(),
    getTodayTasks(),
    (supabase as any).from('linkedin_drafts').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(1),
    getBmlDigestionState(),
    getLatestInsights(3)
  ]);

  const stats = statsResult.status === 'fulfilled' ? statsResult.value : null;
  const youtubeData = youtubeResult.status === 'fulfilled' ? youtubeResult.value : null;
  const linkedinPosts = linkedinResult.status === 'fulfilled' ? linkedinResult.value : [];
  const cadence = cadenceResult.status === 'fulfilled' ? cadenceResult.value : null;
  const weeklyStats = weeklyResult.status === 'fulfilled' ? weeklyResult.value : null;
  const pipeline =
    pipelineResult.status === 'fulfilled'
      ? pipelineResult.value
      : { leads: 0, inProgress: 0, proposals: 0, wonThisMonthRevenue: 0 };
  
  const todayItems = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
  // Séparation Tâches / CRM
  const todayTasks = todayItems.filter(t => t.type === 'task');
  const todayCrmActions = todayItems.filter(t => t.type === 'deal_action');
  
  const pendingDraft = draftResult.status === 'fulfilled' ? draftResult.value.data?.[0] ?? null : null;
  const digestionState = digestionResult.status === 'fulfilled' ? digestionResult.value : { ingested: 0, triaged: 0, canonicalized: 0, extractionFailed: 0 };
  const insights = insightsResult.status === 'fulfilled' ? insightsResult.value : [];
  
  const memory = stats ? { facts: stats.facts, chunks: stats.chunks, entities: stats.entities } : { facts: 0, chunks: 0, entities: 0 };

  const totalPipelineItems = pipeline.leads + pipeline.inProgress + pipeline.proposals;
  
  // Préparation données charts
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const linkedIn30Days = linkedinPosts.filter((post) => {
    const parsed = Date.parse(post.publishedAt);
    return !Number.isNaN(parsed) && parsed >= thirtyDaysAgo;
  });
  const linkedInLikes30d = linkedIn30Days.reduce((sum, post) => sum + post.likes, 0);
  
  // Construction data chart YouTube avec de vraies données (Analytics API)
  // Format attendu par le composant: { date: string, views: number }[]
  const chartData = youtubeData?.dailyStats 
    ? youtubeData.dailyStats.map((stat: any) => ({
        date: new Date(stat.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
        views: stat.views
      }))
    : [];

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Bonjour Mehdi 👋</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">{displayDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/tasks">
            <Button variant="outline" size="sm" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              <Plus className="mr-1.5 h-4 w-4" /> Tâche
            </Button>
          </Link>
          <SyncButton />
        </div>
      </div>

      {/* BARRE DE COMMANDE GLOBALE */}
      <div className="w-full">
        <CopilotCommandBar />
      </div>

      {/* LIGNE 1 : KPIs (4 colonnes) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard 
          title="CA Gagné (Mois)" 
          value={`${pipeline.wonThisMonthRevenue.toLocaleString("fr-FR")} €`} 
          className="border-indigo-100 bg-indigo-50/30 dark:border-indigo-900/30 dark:bg-indigo-950/20"
        />
        <KPICard 
          title="Vues YouTube (30j)" 
          value={youtubeData?.viewsLast30Days?.toLocaleString("fr-FR") || "0"} 
          trend={youtubeData?.weeklyViews ? { 
            value: Number(youtubeData.weeklyViews.deltaPercent.toFixed(1)), 
            label: "vs 7j précédents" 
          } : undefined}
        />
        <KPICard 
          title="Engagement LinkedIn (30j)" 
          value={linkedInLikes30d.toLocaleString("fr-FR")} 
          subtitle="Likes cumulés"
        />
        <KPICard 
          title="Tâches Restantes" 
          value={todayTasks.length} 
          subtitle="Pour aujourd'hui et en retard"
          className={todayTasks.length > 0 ? "border-orange-100 bg-orange-50/30 dark:border-orange-900/30 dark:bg-orange-950/20" : ""}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* PIPELINE */}
          <Card className="border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="pb-3 bg-gradient-to-r from-transparent to-indigo-50/30 dark:to-indigo-950/10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pipeline Commercial</CardTitle>
                  <CardDescription>Deals actifs ({totalPipelineItems})</CardDescription>
                </div>
                <Link href="/pipeline">
                  <Button variant="ghost" size="sm" className="text-indigo-600 dark:text-indigo-400">Gérer</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <PipelineStackedBar 
                leads={pipeline.leads} 
                inProgress={pipeline.inProgress} 
                proposals={pipeline.proposals} 
                className="mb-6"
              />
              {todayCrmActions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Relances à faire aujourd'hui</h4>
                  <TodayTasksList initialTasks={todayCrmActions} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* DRAFT LINKEDIN */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Action Recommandée</h2>
            <DraftFocusCard initialDraft={pendingDraft ? { id: pendingDraft.id, content: pendingDraft.content, style: pendingDraft.style ?? null } : null} />
          </div>
        </div>

        {/* COLONNE DROITE : Tâches */}
        <div className="flex flex-col gap-6">
          <Card className="flex h-full flex-col border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="pb-3 bg-gradient-to-r from-transparent to-orange-50/30 dark:to-orange-950/10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">Priorités Opérationnelles</CardTitle>
                  <CardDescription>Tâches à faire aujourd'hui</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <TodayTasksList initialTasks={todayTasks} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* LIGNE 3 : Analyse & Système (2 colonnes) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <YouTubeChart data={chartData} />
          <LatestInsightsCard insights={insights} />
          <BmlMemorySearch />
        </div>
        
        <div className="flex flex-col gap-6">
          <ContentCadenceCard cadence={cadence} />
          <BmlDigestionStateCard state={digestionState} />
          <SyncStatusList syncStatus={stats?.syncStatus || {}} />
        </div>
      </div>
    </div>
  );
}
