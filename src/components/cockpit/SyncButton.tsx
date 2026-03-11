'use client';

import { useState } from 'react';

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setLastResult(null);

    try {
      const response = await fetch('/api/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: ['notion', 'youtube', 'linkedin'] }),
      });

      const data = await response.json();

      if (data.status === 'completed') {
        const summary = Object.entries(data.results)
          .map(([source, status]) => `${source}: ${status}`)
          .join(', ');
        setLastResult(`Sync terminée — ${summary}`);
      } else {
        setLastResult(`Erreur: ${data.error || 'Sync échouée'}`);
      }
    } catch {
      setLastResult('Erreur de connexion');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {syncing ? (
          <>
            <span className="animate-spin">⟳</span>
            Sync en cours...
          </>
        ) : (
          <>🔄 Sync maintenant</>
        )}
      </button>
      {lastResult && <span className="text-xs text-slate-500">{lastResult}</span>}
    </div>
  );
}
