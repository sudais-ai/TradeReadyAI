"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { searchChunksAction } from "@/actions/dev-search";
import type { SearchResult } from "@/lib/embeddings/search-service";

export function DevSearchClient({
  tradeCaseId,
  totalEmbeddedChunks,
}: {
  tradeCaseId: string;
  totalEmbeddedChunks: number;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  
  const [topK, setTopK] = React.useState(5);
  const [threshold, setThreshold] = React.useState(0.7);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    
    try {
      const res = await searchChunksAction(query, tradeCaseId, {
        topK,
        similarityThreshold: threshold,
      });

      if (res.success && res.results) {
        setResults(res.results);
      } else {
        setError(res.error || "Search failed.");
      }
    } catch {
      setError("An unexpected error occurred during search.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Search Form */}
      <div className="bg-white p-6 rounded-lg border border-border shadow-sm">
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label htmlFor="search-query" className="block text-sm font-medium text-slate-700 mb-1">
              Search Query
            </label>
            <div className="flex gap-3">
              <Input
                id="search-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="E.g., What are the phytosanitary requirements for this export?"
                className="flex-1"
                disabled={totalEmbeddedChunks === 0}
              />
              <Button type="submit" isLoading={isSearching} disabled={!query.trim() || totalEmbeddedChunks === 0}>
                Search
              </Button>
            </div>
          </div>

          <div className="flex gap-6 pt-2">
            <div>
              <label htmlFor="top-k" className="block text-xs text-slate-500 mb-1">
                Top K Results
              </label>
              <Input
                id="top-k"
                type="number"
                min="1"
                max="20"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
                className="w-24 text-sm"
              />
            </div>
            <div>
              <label htmlFor="threshold" className="block text-xs text-slate-500 mb-1">
                Similarity Threshold
              </label>
              <Input
                id="threshold"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value) || 0.7)}
                className="w-24 text-sm"
              />
            </div>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-error-50 text-error-700 text-sm rounded border border-error-200">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {hasSearched && !isSearching && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Results ({results.length})
          </h2>

          {results.length === 0 ? (
            <div className="text-center py-12 bg-white border border-border rounded-lg shadow-sm text-slate-500 italic">
              No relevant chunks found above the similarity threshold.
            </div>
          ) : (
            results.map((result, idx) => (
              <div key={result.chunkId} className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-border px-4 py-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">
                    #{idx + 1} — {result.documentName} (Chunk {result.chunkIndex})
                  </span>
                  <span className={`font-mono font-medium ${
                    result.similarity >= 0.85 ? 'text-success-600' :
                    result.similarity >= 0.75 ? 'text-warning-600' :
                    'text-slate-500'
                  }`}>
                    Score: {result.similarity.toFixed(4)}
                  </span>
                </div>
                <div className="p-4">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-slate-800 bg-slate-50 p-4 rounded border border-slate-200">
                    {result.content}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
