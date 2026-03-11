import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Youtube, FileText, Linkedin, Database, MessageSquare } from "lucide-react";
import { getDashboardStats } from "@/lib/dashboardQueries";

export default async function TodayPage() {
  const stats = await getDashboardStats();

  const summary = { entities: stats.entities, facts: stats.facts, memories: stats.chunks };
  
  const youtubeStatus = stats.syncStatus['youtube'];
  const notionStatus = stats.syncStatus['notion'];
  const linkedinStatus = stats.syncStatus['linkedin'];

  // Format date correctly ensuring we use valid formatting even if date strings are missing
  const today = new Date();
  const formattedDate = new Intl.DateTimeFormat('fr-FR', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }).format(today);

  // Capitalize first letter
  const displayDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  // Calculate last sync date across all connectors
  const allSyncDates = Object.values(stats.syncStatus)
    .map(s => s.last_sync ? new Date(s.last_sync).getTime() : 0)
    .filter(t => t > 0);
  const lastSyncDate = allSyncDates.length > 0 
    ? new Date(Math.max(...allSyncDates)).toLocaleString('fr-FR')
    : 'Jamais';

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Bonjour Mehdi 👋</h1>
        <p className="text-slate-500 mt-1">{displayDate}</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="flex flex-col gap-6">
          {/* Section 1: Draft LinkedIn */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-slate-900">Draft LinkedIn du jour</CardTitle>
                <CardDescription>Ton brouillon prêt à être publié</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-slate-100 text-slate-500">Bientôt</Badge>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-50 rounded-md p-6 text-center border border-dashed border-slate-200">
                <p className="text-slate-500 text-sm">
                  Aucun draft disponible — l'agent LinkedIn sera activé en semaine 3
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Pipeline CRM */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-slate-900">Pipeline</CardTitle>
              <CardDescription>Suivi des opportunités</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-500">Leads</span>
                  <span className="text-2xl font-bold text-slate-900">0</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-500">En cours</span>
                  <span className="text-2xl font-bold text-slate-900">0</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-500">Propositions</span>
                  <span className="text-2xl font-bold text-slate-900">0</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-500">CA ce mois</span>
                  <span className="text-2xl font-bold text-green-600">0 €</span>
                </div>
              </div>
              <div className="bg-blue-50 text-blue-700 rounded-md p-3 text-sm flex items-start gap-2 border border-blue-100">
                <MessageSquare className="w-5 h-5 flex-shrink-0" />
                <p>Commence par dire "j'ai un nouveau lead..." dans le Chat IA</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-6">
          {/* Section 3: Métriques Contenu */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-slate-900">Contenu</CardTitle>
              <CardDescription>Sources synchronisées</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* YouTube */}
                <div className="border border-slate-200 rounded-lg p-4 flex flex-col gap-2 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Youtube className="w-5 h-5 text-red-500" />
                      <span className="font-medium text-slate-900">YouTube</span>
                    </div>
                    {youtubeStatus ? (
                      youtubeStatus.status === 'success' ? 
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none">Actif</Badge> :
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none">Erreur</Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 border-none">Inactif</Badge>
                    )}
                  </div>
                  <div className="mt-2">
                    <p className="text-2xl font-bold text-slate-900">{youtubeStatus?.items_processed || 0}</p>
                    <p className="text-xs text-slate-500">vidéos syncées</p>
                  </div>
                </div>

                {/* Notion */}
                <div className="border border-slate-200 rounded-lg p-4 flex flex-col gap-2 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-slate-700" />
                      <span className="font-medium text-slate-900">Notion</span>
                    </div>
                    {notionStatus ? (
                      notionStatus.status === 'success' ? 
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none">Actif</Badge> :
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none">Erreur</Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 border-none">Inactif</Badge>
                    )}
                  </div>
                  <div className="mt-2">
                    <p className="text-2xl font-bold text-slate-900">{notionStatus?.items_processed || 0}</p>
                    <p className="text-xs text-slate-500">pages syncées</p>
                  </div>
                </div>

                {/* LinkedIn */}
                <div className="border border-slate-200 rounded-lg p-4 flex flex-col gap-2 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Linkedin className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-slate-900">LinkedIn</span>
                    </div>
                    {linkedinStatus ? (
                      linkedinStatus.status === 'success' ? 
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none">Actif</Badge> :
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none whitespace-nowrap">En attente</Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 border-none">Inactif</Badge>
                    )}
                  </div>
                  <div className="mt-2">
                    <p className="text-2xl font-bold text-slate-900">{linkedinStatus?.items_processed || 0}</p>
                    <p className="text-xs text-slate-500">posts syncés</p>
                  </div>
                </div>
              </div>
              
              <div className="text-xs text-slate-500 mt-2 flex justify-end">
                Dernière sync : {lastSyncDate}
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Mémoire Business */}
          <Card className="border-slate-200 shadow-sm flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-500" />
                Mémoire Business
              </CardTitle>
              <CardDescription>Cerveau du système BML</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-x-6 gap-y-4 mb-6">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-500">Faits actifs</span>
                  <span className="text-2xl font-bold text-slate-900">{summary.facts}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-500">Chunks vectorisés</span>
                  <span className="text-2xl font-bold text-slate-900">{summary.memories}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-500">Entités</span>
                  <span className="text-2xl font-bold text-slate-900">{summary.entities}</span>
                </div>
              </div>

              <div className="mt-4">
                <form action="/api/memory/search" method="POST" className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    name="query" 
                    placeholder="Chercher dans la mémoire (ex: offre principale, process de vente...)" 
                    className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                  />
                  {/* Note: This is just a UI placeholder for the form, actual search would need client-side handling to show results here */}
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
