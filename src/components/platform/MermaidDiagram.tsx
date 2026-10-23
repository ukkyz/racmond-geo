"use client";

import { useEffect, useRef, useState } from "react";

let mermaidPromise: Promise<typeof import("mermaid")> | null = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        flowchart: { curve: "basis", padding: 14 },
      });
      return m;
    });
  }
  return mermaidPromise;
}

export function MermaidDiagram({
  chart,
  id,
}: {
  chart: string;
  id: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(async (m) => {
        const rendered = await m.default.render(id, chart);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = rendered.svg;
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to render diagram");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  return (
    <div className="mermaid-wrap">
      {error ? (
        <pre className="p-3 text-[11px] text-rose-300">{error}</pre>
      ) : null}
      <div ref={ref} />
    </div>
  );
}
