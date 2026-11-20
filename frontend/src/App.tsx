import { useCallback, useEffect, useState } from "react";
import { Footer } from "./components/footer";
import { Navbar } from "./components/navbar";
import { DetailLayout } from "./layouts/detail";
import { SearchLayout } from "./layouts/search";

/** Sayfa durumu URL'de tutulur: ?q=MEFV (arama) veya ?gene=4210 (detay). Böylece link paylaşılabilir. */
function readParams() {
  return new URLSearchParams(window.location.search);
}

function App() {
  const [params, setParams] = useState(readParams);

  useEffect(() => {
    const onPop = () => setParams(readParams());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && p.set(k, v));
    const url = p.toString() ? `?${p}` : window.location.pathname;
    window.history.pushState(null, "", url);
    setParams(new URLSearchParams(p));
    window.scrollTo({ top: 0 });
  }, []);

  const geneId = params.get("gene");

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar onHome={() => navigate({})} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {geneId ? (
          <DetailLayout
            key={geneId}
            geneId={geneId}
            onBack={() => (window.history.length > 1 ? window.history.back() : navigate({}))}
          />
        ) : (
          <SearchLayout
            query={params.get("q") ?? ""}
            organism={params.get("organism") ?? ""}
            onSearch={(q, organism) => navigate({ q, organism })}
            onOpen={(id) => navigate({ gene: id })}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
