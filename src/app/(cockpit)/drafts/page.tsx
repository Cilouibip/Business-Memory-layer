import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Linkedin } from "lucide-react";

export default function DraftsPage() {
  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Drafts LinkedIn</h1>
        <p className="text-slate-500 mt-1">Gère tes publications générées automatiquement</p>
      </div>

      <Card className="border-slate-200 shadow-sm min-h-[400px]">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center h-full min-h-[400px]">
          <div className="bg-blue-50 rounded-full p-4 mb-4">
            <Linkedin className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">Agent LinkedIn en préparation</h3>
          <p className="text-slate-500 max-w-md">
            L'agent LinkedIn commencera à générer des drafts automatiques à partir de ta mémoire business en semaine 3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
