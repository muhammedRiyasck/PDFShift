"use client";

import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

interface PDFPageThumbnailProps {
  pdfUrl: string;
  pageNumber: number;
}

/** Skeleton that mimics a document page — header block + text lines */
function PageSkeleton() {
  return (
    <div className="w-full h-full bg-slate-900 flex flex-col gap-2 p-3 overflow-hidden">
      {/* Fake header block */}
      <div className="w-3/4 h-2.5 rounded bg-slate-700 animate-pulse" />
      <div className="w-1/2 h-2 rounded bg-slate-800 animate-pulse" />
      {/* Separator */}
      <div className="w-full h-px bg-slate-700/50 mt-1" />
      {/* Fake text lines */}
      {[100, 90, 95, 80, 88, 70, 92, 75, 85, 60].map((w, i) => (
        <div
          key={i}
          className="h-1.5 rounded bg-slate-700/70 animate-pulse"
          style={{
            width: `${w}%`,
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
      {/* Fake image placeholder */}
      <div className="flex-1 rounded bg-slate-800 animate-pulse mt-1" style={{ animationDelay: "200ms" }} />
      {/* Bottom text lines */}
      {[88, 72].map((w, i) => (
        <div
          key={i}
          className="h-1.5 rounded bg-slate-700/70 animate-pulse"
          style={{ width: `${w}%`, animationDelay: `${(i + 10) * 60}ms` }}
        />
      ))}
    </div>
  );
}

/** Error state */
function PageError({ pageNumber }: { pageNumber: number }) {
  return (
    <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center gap-2 text-slate-500">
      <svg className="w-7 h-7 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <span className="text-xs font-medium">Page {pageNumber}</span>
    </div>
  );
}

export default function PDFPageThumbnail({ pdfUrl, pageNumber }: PDFPageThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(180);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const initial = el.getBoundingClientRect().width;
    if (initial > 0) setContainerWidth(Math.floor(initial));

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(Math.floor(w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (error) {
    return (
      <div ref={containerRef} className="w-full aspect-[3/4]">
        <PageError pageNumber={pageNumber} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full aspect-[3/4] flex items-start justify-center overflow-hidden bg-slate-900">
      <Document
        file={pdfUrl}
        suspense={false}
        onLoadError={(err) => {
          console.error("PDF thumbnail load error:", err);
          setError(true);
        }}
        loading={<div className="w-full aspect-[3/4]"><PageSkeleton /></div>}
      >
        <Page
          pageNumber={pageNumber}
          width={containerWidth}
          suspense={false}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          loading={<div className="w-full aspect-[3/4]"><PageSkeleton /></div>}
          error={<div className="w-full aspect-[3/4]"><PageError pageNumber={pageNumber} /></div>}
        />
      </Document>
    </div>
  );
}
