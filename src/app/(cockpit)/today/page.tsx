import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Database, Linkedin, MessageSquare, Search, Youtube } from "lucide-react";
import { getDashboardStats, getPipelineBusinessSummary, getTodayTasks } from "@/lib/dashboardQueries";
import { getYouTubeBusinessSnapshot } from "@/lib/youtubeAnalytics";
import { getLatestLinkedInPosts } from "@/lib/linkedinAnalytics";

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

  let memory = { facts: 0, chunks: 0, entities: 0 };
  let youtubeData: Awaited<ReturnType<typeof getYouTubeBusinessSnapshot>> | null = null;
  let linkedinPosts: Awaited<ReturnType<typeof getLatestLinkedInPosts>> = [];
  let pipeline = { leads: 0, inProgress: 0, proposals: 0, wonThisMonthRevenue: 0 };
  let todayTasks: Awaited<ReturnType<typeof getTodayTasks>> = [];

  let youtubeError: string | null = null;
  let linkedinError: string | null = null;
  let pipelineError: string | null = null;
  let tasksError: string | null = null;

  try {
    const stats = await getDashboardStats();
    memory = { facts: stats.facts, chunks: stats.chunks, entities: stats.entities };
  } catch (error) {
    console.error("Erreur mémoire BML", error);
  }

  try {
    youtubeData = await getYouTubeBusinessSnapshot();
  } catch (error) {
    console.error("Erreur YouTube", error);
    youtubeError = "Données YouTube indisponibles";
  }

  try {
    linkedinPosts = await getLatestLinkedInPosts(3);
  } catch (error) {
    console.error("Erreur LinkedIn", error);
    linkedinError = "Données LinkedIn indisponibles";
  }

  try {
    pipeline = await getPipelineBusinessSummary();
  } catch (error) {
    console.error("Erreur Pipeline", error);
    pipelineError = "Données pipeline indisponibles";
  }

  try {
    todayTasks = await getTodayTasks();
  } catch (error) {
    console.error("Erreur tâches du jour", error);
    tasksError = "Tâches indisponibles";
  }

  const totalPipelineItems = pipeline.leads + pipeline.inProgress + pipeline.proposals;
  const priorityClass: Record<string, string> = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-slate-100 text-slate-700 border-slate-200",
  };

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
              {!tasksError && todayTasks.length === 0 ? (
                <p className="text-sm text-slate-500">Rien à faire — ton business tourne tout seul 🎉</p>
              ) : null}
              {!tasksError &&
                todayTasks.map((task, index) => (
                  <div key={`${task.type}-${index}`} className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{task.title}</p>
                      <Badge className={priorityClass[task.priority]}>{task.priority}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{task.subtitle}</p>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Youtube className="h-5 w-5 text-red-500" />
                YouTube
              </CardTitle>
              <CardDescription>Abonnés, vues 30 jours, dernières vidéos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {youtubeError || !youtubeData ? (
                <p className="text-sm text-slate-500">Données YouTube indisponibles</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
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
                  </div>
                  <div className="space-y-2">
                    {youtubeData.latestVideos.map((video) => (
                      <div key={video.id} className="rounded-md border border-slate-200 bg-white p-3">
                        <p className="text-sm font-medium text-slate-900">{video.title}</p>
                        <p className="text-xs text-slate-500">
                          {video.views.toLocaleString("fr-FR")} vues •{" "}
                          {new Date(video.publishedAt).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    ))}
                  </div>
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
              <CardDescription>3 derniers posts et engagement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {linkedinError ? <p className="text-sm text-slate-500">Données LinkedIn indisponibles</p> : null}
              {!linkedinError && linkedinPosts.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun post LinkedIn disponible</p>
              ) : null}
              {!linkedinError &&
                linkedinPosts.map((post) => (
                  <div key={post.id} className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="text-sm text-slate-900">{post.text || "Post sans texte"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      👍 {post.likes} • 💬 {post.comments} • 🔁 {post.shares}
                    </p>
                  </div>
                ))}
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
              <form action="/api/memory/search" method="POST" className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  name="query"
                  placeholder="Recherche sémantique (ex: offre principale, objections clients...)"
                  className="border-slate-200 bg-slate-50 pl-9"
                />
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
