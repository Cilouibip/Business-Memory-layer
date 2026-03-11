import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ChatPage() {
  return (
    <div className="flex flex-col gap-8 h-full max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Chat IA</h1>
        <p className="text-slate-500 mt-1">Échange avec ton business brain</p>
      </div>

      <Card className="flex-1 flex flex-col border-slate-200 shadow-sm min-h-[500px]">
        <CardContent className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-slate-50 rounded-full p-4 mb-4">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="32" 
              height="32" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="text-slate-400"
            >
              <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">Bientôt disponible</h3>
          <p className="text-slate-500 max-w-md">
            Le chat IA sera connecté à Claude en semaine 2. Tu pourras lui poser des questions sur tes contenus, ton CRM, et générer de nouvelles idées basées sur ta mémoire.
          </p>
        </CardContent>
        <div className="p-4 border-t border-slate-100">
          <Input 
            placeholder="Parle à ton business..." 
            disabled
            className="bg-slate-50 border-slate-200"
          />
        </div>
      </Card>
    </div>
  );
}
