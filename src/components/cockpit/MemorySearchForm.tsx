'use client';

import { FormEvent, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

type SearchResult = {
  entity_type: string;
  entity_id: string;
  chunk_text: string;
  score: number;
};

export function MemorySearchForm() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/memory/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setResults([]);
        setError(typeof payload?.error === 'string' ? payload.error : 'Recherche indisponible');
        return;
      }

      setResults(Array.isArray(payload?.results) ? payload.results : []);
    } catch {
      setResults([]);
      setError('Recherche indisponible');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Recherche sémantique (ex: offre principale, objections clients...)"
          className="border-slate-200 bg-slate-50 pl-9"
        />
      </form>

      {isLoading ? <p className="text-xs text-slate-500">Recherche en cours...</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {!isLoading && !error && results.length > 0 ? (
        <div className="space-y-2">
          {results.slice(0, 3).map((result, index) => (
            <div key={`${result.entity_type}-${result.entity_id}-${index}`} className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-700">
                {result.entity_type} • score {result.score.toFixed(2)}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-900">{result.chunk_text}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
