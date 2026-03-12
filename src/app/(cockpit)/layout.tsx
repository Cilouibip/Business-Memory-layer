import Link from "next/link";
import { 
  Home, 
  MessageSquare, 
  FileText, 
  BarChart3, 
  ListTodo,
  Settings, 
  Menu 
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-[240px] flex-col fixed inset-y-0 left-0 bg-slate-900 text-slate-50 z-50">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">BML</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <Link 
            href="/today" 
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors"
          >
            <Home className="w-5 h-5" />
            <span>Aujourd'hui</span>
          </Link>
          
          <Link 
            href="/chat" 
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors"
          >
            <MessageSquare className="w-5 h-5" />
            <span>Chat IA</span>
          </Link>
          
          <Link 
            href="/drafts" 
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors"
          >
            <FileText className="w-5 h-5" />
            <span>Drafts</span>
          </Link>
          
          <Link 
            href="/pipeline" 
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors"
          >
            <BarChart3 className="w-5 h-5" />
            <span>Pipeline</span>
          </Link>

          <Link 
            href="/tasks" 
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors"
          >
            <ListTodo className="w-5 h-5" />
            <span>Tâches</span>
          </Link>
          
          <div className="my-4">
            <Separator className="bg-slate-800" />
          </div>
          
          <div className="flex items-center gap-3 px-3 py-2 rounded-md text-slate-500 cursor-not-allowed">
            <Settings className="w-5 h-5" />
            <span>Paramètres</span>
          </div>
        </nav>
        
        <div className="p-4 text-xs text-slate-500">
          Business Memory Layer v0.1
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:pl-[240px]">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between p-4 bg-slate-900 text-slate-50">
          <h1 className="text-xl font-bold">BML</h1>
          <button className="p-2 -mr-2">
            <Menu className="w-6 h-6" />
          </button>
        </header>

        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
