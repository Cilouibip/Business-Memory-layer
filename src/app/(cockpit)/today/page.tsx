import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MemorySearchForm } from "@/components/cockpit/MemorySearchForm";
import { SyncButton } from "@/components/cockpit/SyncButton";
import { TodayTasks } from "@/components/cockpit/TodayTasks";
import { Database, Linkedin, MessageSquare, Youtube } from "lucide-react";
import { getContentCadence, getDashboardStats, getPipelineBusinessSummary, getTodayTasks, getWeeklyStats } from "@/lib/dashboardQueries";
import { getAllVideos, getYouTubeBusinessSnapshot, type YouTubeVideoStats } from "@/lib/youtubeAnalytics";
import { getAllLinkedInPosts, type LinkedInPostStats } from "@/lib/linkedinAnalytics";

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
    allVideosResult,
    linkedinResult,
    cadenceResult,
    weeklyResult,
    pipelineResult,
    tasksResult,
  ] = await Promise.allSettled([
    getDashboardStats(),
    getYouTubeBusinessSnapshot(),
    getAllVideos(),
    getAllLinkedInPosts(),
    getContentCadence(),
    getWeeklyStats(),
    getPipelineBusinessSummary(),
    getTodayTasks(),
  ]);

  const stats = statsResult.status === 'fulfilled' ? statsResult.value : null;
  const youtubeData = youtubeResult.status === 'fulfilled' ? youtubeResult.value : null;
  const allYoutubeVideos = allVideosResult.status === 'fulfilled' ? allVideosResult.value : [];
  const linkedinPosts = linkedinResult.status === 'fulfilled' ? linkedinResult.value : [];
  const cadence = cadenceResult.status === 'fulfilled' ? cadenceResult.value : null;
  const weeklyStats = weeklyResult.status === 'fulfilled' ? weeklyResult.value : null;
  const pipeline =
    pipelineResult.status === 'fulfilled'
      ? pipelineResult.value
      : { leads: 0, inProgress: 0, proposals: 0, wonThisMonthRevenue: 0 };
  const todayTasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
  const memory = stats ? { facts: stats.facts, chunks: stats.chunks, entities: stats.entities } : { facts: 0, chunks: 0, entities: 0 };

  const youtubeError = youtubeResult.status === 'rejected' ? 'Données YouTube indisponibles' : null;
  const linkedinError = linkedinResult.status === 'rejected' ? 'Données LinkedIn indisponibles' : null;
  const pipelineError = pipelineResult.status === 'rejected' ? 'Données pipeline indisponibles' : null;
  const tasksError = tasksResult.status === 'rejected' ? 'Tâches indisponibles' : null;

  const totalPipelineItems = pipeline.leads + pipeline.inProgress + pipeline.proposals;
  const videoList = (allYoutubeVideos.length > 0 ? allYoutubeVideos : youtubeData?.latestVideos ?? []) as YouTubeVideoStats[];
  const visibleVideos = videoList.slice(0, 3);
  const hiddenVideos = videoList.slice(3);
  const visibleLinkedInPosts = linkedinPosts.slice(0, 3) as LinkedInPostStats[];
  const hiddenLinkedInPosts = linkedinPosts.slice(3) as LinkedInPostStats[];
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const linkedIn30Days = linkedinPosts.filter((post) => {
    const parsed = Date.parse(post.publishedAt);
    return !Number.isNaN(parsed) && parsed >= thirtyDaysAgo;
  });
  const linkedInLikes30d = linkedIn30Days.reduce((sum, post) => sum + post.likes, 0);
  const linkedInComments30d = linkedIn30Days.reduce((sum, post) => sum + post.comments, 0);
  const deltaSign = weeklyStats && weeklyStats.deltaPercent > 0 ? "+" : "";
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Bonjour Mehdi 👋</h1>
        <p className="mt-1 text-slate-500">{displayDate}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-slate-900">Draft LinkedIn du jour</CardTitle>
              <CardDescription>Ton brouillon prêt à publier</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-sm text-slate-500">Agent LinkedIn pas encore activé</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-slate-900">Tâches du jour</CardTitle>
              <CardDescription>Priorités opérationnelles du matin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasksError ? <p className="text-sm text-slate-500">{tasksError}</p> : null}
              {!tasksError ? <TodayTasks initialTasks={todayTasks} /> : null}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Youtube className="h-5 w-5 text-red-500" />
                YouTube
              </CardTitle>
              <CardDescription>Abonnés, vues, cadence et toutes les vidéos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {youtubeError || !youtubeData ? (
                <p className="text-sm text-slate-500">Données YouTube indisponibles</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div>
                      <p className="text-sm text-slate-500">Abonnés</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {youtubeData.channel.subscriberCount.toLocaleString("fr-FR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Vues 30 jours</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {youtubeData.viewsLast30Days.toLocaleString("fr-FR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Nouveaux abonnés (7j)</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {youtubeData.subscribersGainedLast7Days.toLocaleString("fr-FR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Vues cette semaine</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {weeklyStats ? weeklyStats.thisWeekViews.toLocaleString("fr-FR") : "—"}
                      </p>
                    </div>
                  </div>
                  {weeklyStats ? (
                    <p className="text-xs text-slate-500">
                      {deltaSign}
                      {weeklyStats.deltaPercent.toFixed(1)}% de vues cette semaine vs semaine dernière
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {visibleVideos.map((video) => (
                      <div key={video.id} className="rounded-md border border-slate-200 bg-white p-3">
                        <p className="text-sm font-medium text-slate-900">{video.title}</p>
                        <p className="text-xs text-slate-500">
                          {video.views.toLocaleString("fr-FR")} vues •{" "}
                          {new Date(video.publishedAt).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    ))}
                  </div>
                  {hiddenVideos.length > 0 ? (<details className="rounded-md border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Voir toutes les vidéos ({allYoutubeVideos.length})</summary><div className="mt-3 space-y-2">{hiddenVideos.map((video) => (<div key={`${video.id}-all`} className="rounded-md border border-slate-200 bg-white p-3"><p className="text-sm font-medium text-slate-900">{video.title}</p><p className="text-xs text-slate-500">{video.views.toLocaleString("fr-FR")} vues • {video.likes.toLocaleString("fr-FR")} likes • {video.comments.toLocaleString("fr-FR")} commentaires</p></div>))}</div></details>) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Linkedin className="h-5 w-5 text-blue-600" />
                LinkedIn
              </CardTitle>
              <CardDescription>Cadence, engagement 30 jours, tous les posts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {linkedinError ? <p className="text-sm text-slate-500">Données LinkedIn indisponibles</p> : null}
              {!linkedinError ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500">Engagement likes (30j)</p>
                    <p className="text-2xl font-bold text-slate-900">{linkedInLikes30d.toLocaleString("fr-FR")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Commentaires (30j)</p>
                    <p className="text-2xl font-bold text-slate-900">{linkedInComments30d.toLocaleString("fr-FR")}</p>
                  </div>
                </div>
              ) : null}
              {!linkedinError && cadence && cadence.linkedInDaysAgo !== null ? (
                <p className="text-xs text-slate-500">
                  Dernier post il y a {cadence.linkedInDaysAgo} jours — objectif : 1 tous les 3 jours
                </p>
              ) : null}
              {!linkedinError && linkedinPosts.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun post LinkedIn disponible</p>
              ) : null}
              {!linkedinError &&
                visibleLinkedInPosts.map((post) => (
                  <div key={post.id} className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="text-sm text-slate-900">{post.text || "Post sans texte"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      👍 {post.likes} • 💬 {post.comments} • 🔁 {post.shares}
                    </p>
                  </div>
                ))}
              {!linkedinError && hiddenLinkedInPosts.length > 0 ? (
                <details className="rounded-md border border-slate-200 bg-slate-50 p-3" suppressHydrationWarning>
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Voir tous les posts ({linkedinPosts.length})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {hiddenLinkedInPosts.map((post) => (
                      <div key={`${post.id}-all`} className="rounded-md border border-slate-200 bg-white p-3">
                        <p className="text-sm text-slate-900">{post.text || "Post sans texte"}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          👍 {post.likes} • 💬 {post.comments} • 🔁 {post.shares}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-slate-900">Pipeline</CardTitle>
              <CardDescription>Métriques commerciales du jour</CardDescription>
            </CardHeader>
            <CardContent>
              {pipelineError ? <p className="text-sm text-slate-500">{pipelineError}</p> : null}
              {!pipelineError && totalPipelineItems === 0 && pipeline.wonThisMonthRevenue === 0 ? (
                <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                  <MessageSquare className="h-5 w-5 shrink-0" />
                  <p>Aucun deal — commence par le Chat IA</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500">Leads</p>
                    <p className="text-2xl font-bold text-slate-900">{pipeline.leads}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Deals en cours</p>
                    <p className="text-2xl font-bold text-slate-900">{pipeline.inProgress}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Propositions</p>
                    <p className="text-2xl font-bold text-slate-900">{pipeline.proposals}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">CA gagné ce mois</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      {pipeline.wonThisMonthRevenue.toLocaleString("fr-FR")} €
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Database className="h-4 w-4 text-indigo-500" />
                Mémoire BML
              </CardTitle>
              <CardDescription className="text-xs">Contexte business disponible</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                  Faits: {memory.facts}
                </Badge>
                <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                  Chunks: {memory.chunks}
                </Badge>
                <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                  Entités: {memory.entities}
                </Badge>
              </div>
              <MemorySearchForm />
              <SyncButton />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
