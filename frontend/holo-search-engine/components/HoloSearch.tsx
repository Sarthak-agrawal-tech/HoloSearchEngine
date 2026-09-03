"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SearchInput } from "./SearchInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";

// Adjust according to your API response format
interface AnimeResult {
  title: string;
  url: string;
  excerpt: string;
  rrf_score: number;
  qdrant_score: number;
  tantivy_score: number;
}

export default function HoloSearch() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const RUST_API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080";
  const query = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);

  const [results, setResults] = useState<AnimeResult[]>([]);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Trigger search on query/page change
  useEffect(() => {
    if (!query) {
      setResults([]);
      setTotalResults(0);
      setAiSummary(null);
      return;
    }

    const fetchResults = async () => {
      setLoading(true);
      try {
        // Replace with your actual API endpoint
       const res = await fetch(`${RUST_API_BASE}/search?q=${encodeURIComponent(query)}&page=${page}&page_size=10`);
        const data = await res.json();
        
        // Assuming API returns { data: [...], total: number }
        setResults(data.results || []);
        setTotalResults(data.total || 0);
        if (page === 1) {
            setAiSummary(data.ai_summary || null);
        }
      } catch (err) {
        console.error("Failed to fetch anime search results:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query, page, RUST_API_BASE]);

  // Handler passed to SearchInput
  const handleSearch = (newQuery: string) => {
    if (!newQuery.trim()) return;
    router.push(`/?q=${encodeURIComponent(newQuery)}&page=1`);
  };

  const handlePageChange = (newPage: number) => {
    router.push(`/?q=${encodeURIComponent(query)}&page=${newPage}`);
  };

  const totalPages = Math.ceil(totalResults / 10);
  const hasSearched = Boolean(query);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* LANDING STATE: Centered Hero */}
      {!hasSearched ? (
        <main className="flex-1 flex flex-col items-center justify-center p-4 text-center -mt-16">
          <div className="space-y-3 mb-8">
            <h1 className="text-7xl sm:text-8xl font-black tracking-tight text-primary drop-shadow-sm">
              HOLO
            </h1>
            <p className="text-muted-foreground text-lg sm:text-xl font-medium tracking-wide">
              Anime Search Engine
            </p>
          </div>

          <div className="w-full max-w-2xl">
            <SearchInput
              defaultValue={query}
              onSearch={handleSearch}
              placeholder="Search anime, characters, studios..."
            />
          </div>
        </main>
      ) : (
        /* RESULTS STATE: Top Header + Result List */
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
          {/* Header Bar */}
          <header className="flex flex-col sm:flex-row items-center gap-4 pb-4 border-b">
            <button
              onClick={() => router.push("/")}
              className="text-3xl font-black text-primary hover:opacity-80 transition-opacity"
            >
              holo
            </button>
            <div className="w-full max-w-2xl">
              <SearchInput
                defaultValue={query}
                onSearch={handleSearch}
                placeholder="Search anime..."
              />
            </div>
          </header>

          {/* Search Metadata */}
          <div className="text-sm text-muted-foreground">
            {loading ? (
              <span>Searching...</span>
            ) : (
              <span>
                Found <strong className="text-foreground">{totalResults}</strong> results for &quot;{query}&quot;
              </span>
            )}
          </div>

          {/* Results List (10 Items) */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : results.length > 0 ? (
            <div className="flex flex-col gap-4">
              {aiSummary && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-2 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary/50 to-primary/10"></div>
                  <div className="flex items-center gap-2 mb-2 text-primary font-medium text-sm">
                    ✨ AI Overview
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {aiSummary}
                  </p>
                  <div className="mt-3 text-[10px] text-muted-foreground font-mono uppercase tracking-widest opacity-50">
                    Powered by Gemini
                  </div>
                </div>
              )}
              {results.map((anime, index) => (
                // Using index as a fallback key since your Rust API doesn't return an ID
                <Card key={index} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-xl font-bold hover:underline cursor-pointer">
                        <a href={anime.url || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1.5">
                          {anime.title}
                          {anime.url && <ExternalLink className="w-4 h-4 text-muted-foreground" />}
                        </a>
                      </CardTitle>
                      {/* Show the Reciprocal Rank Fusion score */}
                      <Badge variant="secondary" className="shrink-0">
                        Score: {anime.rrf_score.toFixed(3)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2">
                    {/* Render the excerpt from Tantivy/Qdrant */}
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {anime.excerpt || "No excerpt available."}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                       <span title={`Tantivy: ${anime.tantivy_score.toFixed(2)} | Qdrant: ${anime.qdrant_score.toFixed(2)}`}>
                         Hybrid Search Result
                       </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              No results found for &quot;{query}&quot;. Try a different term.
            </div>
          )}

          {/* Google-Style Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-6 pb-12">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>

              <div className="flex items-center gap-1 px-2 text-sm font-medium">
                Page {page} of {totalPages}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </main>
      )}
    </div>
  );
}