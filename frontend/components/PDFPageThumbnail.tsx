"use client";

import "@/lib/polyfills";
import React, { useState, useEffect, useRef, useMemo, Component, ErrorInfo, ReactNode } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
}

interface PDFPageThumbnailProps {
  pdfUrl?: string;
  pdfData?: Uint8Array | null;
  pageNumber: number;
  rotation?: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  pageNumber: number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

class ThumbnailErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Page ${this.props.pageNumber} Component Crash]`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <PageError pageNumber={this.props.pageNumber} message={this.state.errorMessage} />;
    }
    return this.props.children;
  }
}

/** Skeleton that mimics a document page — header block + text lines */
function PageSkeleton() {
  return (
    <div className="w-full h-full bg-slate-900 flex flex-col gap-2 p-3 overflow-hidden">
      <div className="w-3/4 h-2.5 rounded bg-slate-700 animate-pulse" />
      <div className="w-1/2 h-2 rounded bg-slate-800 animate-pulse" />
      <div className="w-full h-px bg-slate-700/50 mt-1" />
      {[100, 90, 95, 80, 88, 70, 92, 75, 85, 60].map((w, i) => (
        <div
          key={i}
          className="h-1.5 rounded bg-slate-700/70 animate-pulse"
          style={{ width: `${w}%`, animationDelay: `${i * 60}ms` }}
        />
      ))}
      <div className="flex-1 rounded bg-slate-800 animate-pulse mt-1" style={{ animationDelay: "200ms" }} />
    </div>
  );
}

/** Detailed Error state */
function PageError({ pageNumber, message }: { pageNumber: number; message?: string }) {
  return (
    <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-2 text-rose-400 text-center select-none overflow-hidden">
      <svg className="w-6 h-6 opacity-75 mb-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <span className="text-[11px] font-bold text-slate-300">Page {pageNumber}</span>
      {message && (
        <span className="text-[9px] text-rose-300 mt-1 font-mono break-all line-clamp-3 px-1 leading-tight">
          {message}
        </span>
      )}
    </div>
  );
}

export default function PDFPageThumbnail({
  pdfUrl,
  pdfData,
  pageNumber,
  rotation = 0,
}: PDFPageThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(180);
  const [isVisible, setIsVisible] = useState<boolean>(pageNumber <= 8);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [useDataFallback, setUseDataFallback] = useState(false);

  const fileSource = useMemo(() => {
    if (useDataFallback && pdfData && pdfData.byteLength > 0) {
      return { data: pdfData.slice() };
    }
    if (pdfUrl) return pdfUrl;
    if (pdfData && pdfData.byteLength > 0) {
      return { data: pdfData.slice() };
    }
    return undefined;
  }, [pdfData, pdfUrl, useDataFallback]);

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

    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setIsVisible(true);
              io?.disconnect();
              break;
            }
          }
        },
        { rootMargin: "300px" }
      );
      io.observe(el);
    } else {
      setIsVisible(true);
    }

    return () => {
      ro.disconnect();
      io?.disconnect();
    };
  }, []);

  if (error) {
    return (
      <div ref={containerRef} className="w-full aspect-[3/4]">
        <PageError pageNumber={pageNumber} message={errorMessage || "Render failed"} />
      </div>
    );
  }

  // No source yet — still downloading; show skeleton, not an error
  if (!fileSource) {
    return (
      <div ref={containerRef} className="w-full aspect-[3/4] overflow-hidden bg-slate-900">
        <PageSkeleton />
      </div>
    );
  }

  if (!isVisible) {
    return (
      <div ref={containerRef} className="w-full aspect-[3/4] overflow-hidden bg-slate-900">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <ThumbnailErrorBoundary pageNumber={pageNumber}>
      <div ref={containerRef} className="w-full aspect-[3/4] flex items-start justify-center overflow-hidden bg-slate-900">
        <Document
          file={fileSource}
          suspense={false}
          onSourceError={(err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Thumbnail P${pageNumber}] Source Error:`, msg);
            if (!useDataFallback && pdfData && pdfData.byteLength > 0) {
              setUseDataFallback(true);
              return;
            }
            setErrorMessage(msg);
            setError(true);
          }}
          onLoadError={(err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[Thumbnail P${pageNumber}] Document load error:`, msg);
            if (!useDataFallback && pdfData && pdfData.byteLength > 0) {
              setUseDataFallback(true);
              return;
            }
            setErrorMessage(msg);
            setError(true);
          }}
          loading={<div className="w-full aspect-[3/4]"><PageSkeleton /></div>}
        >
          <Page
            pageNumber={pageNumber}
            width={Math.max(120, Math.min(containerWidth || 180, 400))}
            devicePixelRatio={1}
            rotate={rotation || 0}
            suspense={false}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            onRenderError={(err) => {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[Thumbnail P${pageNumber}] Canvas render error:`, msg);
              setErrorMessage(msg);
              setError(true);
            }}
            loading={<div className="w-full aspect-[3/4]"><PageSkeleton /></div>}
            error={<div className="w-full aspect-[3/4]"><PageError pageNumber={pageNumber} message={errorMessage} /></div>}
          />
        </Document>
      </div>
    </ThumbnailErrorBoundary>
  );
}
