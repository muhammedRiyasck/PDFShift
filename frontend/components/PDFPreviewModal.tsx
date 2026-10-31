"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  selectedPages: number[];
  onToggleSelect: (page: number) => void;
  initialMode?: "all" | "selected";
  pageRotations?: Record<number, number>;
  onRotatePage?: (page: number) => void;
}

export default function PDFPreviewModal({
  isOpen,
  onClose,
  pdfUrl,
  totalPages,
  currentPage,
  onPageChange,
  selectedPages,
  onToggleSelect,
  initialMode = "all",
  pageRotations,
  onRotatePage,
}: PDFPreviewModalProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [localRotation, setLocalRotation] = useState<number>(0);
  const currentRotation = pageRotations ? (pageRotations[currentPage] || 0) : localRotation;
  const [mode, setMode] = useState<"all" | "selected">(initialMode);
  const [pageWidth, setPageWidth] = useState<number>(600);
  const [pageLoading, setPageLoading] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const pillsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active page pill into view whenever currentPage changes or modal opens
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      const container = pillsContainerRef.current;
      if (!container) return;

      const activeBtn = container.querySelector<HTMLElement>(
        `[data-page="${currentPage}"]`
      );
      if (activeBtn) {
        const containerRect = container.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();

        // Calculate offset to smoothly center the active button in the scroll container
        const scrollOffset =
          btnRect.left -
          containerRect.left -
          containerRect.width / 2 +
          btnRect.width / 2;

        container.scrollBy({
          left: scrollOffset,
          behavior: "smooth",
        });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [currentPage, isOpen, mode]);

  const handlePillsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (pillsContainerRef.current && e.deltaY !== 0) {
      pillsContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  // Sync mode with initialMode when opened
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setZoom(1);
      setLocalRotation(0);
    }
  }, [isOpen, initialMode]);

  // If in 'selected' mode and selectedPages becomes empty, fall back to 'all'
  useEffect(() => {
    if (mode === "selected" && selectedPages.length === 0) {
      setMode("all");
    }
  }, [mode, selectedPages.length]);

  // Responsive page width calculation based on viewport
  useEffect(() => {
    if (!isOpen) return;

    const updateWidth = () => {
      if (!containerRef.current) return;
      const availableWidth = containerRef.current.clientWidth - 48; // padding
      const availableHeight = containerRef.current.clientHeight - 48;

      // Assuming standard ~3:4 aspect ratio
      const widthBasedOnHeight = availableHeight * (3 / 4);
      const targetWidth = Math.min(availableWidth, widthBasedOnHeight, 900);
      setPageWidth(Math.max(Math.floor(targetWidth), 280));
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isOpen]);

  // Determine navigation sequence based on mode
  const currentSequence = mode === "selected" && selectedPages.length > 0
    ? selectedPages
    : Array.from({ length: totalPages }, (_, i) => i + 1);

  const currentIndex = currentSequence.indexOf(currentPage);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < currentSequence.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      setPageLoading(true);
      onPageChange(currentSequence[currentIndex - 1]);
    }
  }, [hasPrev, currentIndex, currentSequence, onPageChange]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      setPageLoading(true);
      onPageChange(currentSequence[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, currentSequence, onPageChange]);

  const handleZoomIn = () => setZoom((z) => Math.min(Number((z + 0.25).toFixed(2)), 2.5));
  const handleZoomOut = () => setZoom((z) => Math.max(Number((z - 0.25).toFixed(2)), 0.5));
  const handleResetZoom = () => setZoom(1);
  const handleRotate = () => {
    if (onRotatePage) {
      onRotatePage(currentPage);
    } else {
      setLocalRotation((r) => (r + 90) % 360);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input/textarea
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === " ") {
        e.preventDefault();
        onToggleSelect(currentPage);
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleResetZoom();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleRotate();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose, onToggleSelect, currentPage]);

  if (!isOpen) return null;

  const isSelected = selectedPages.includes(currentPage);
  const selectionOrder = selectedPages.indexOf(currentPage) + 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of Page ${currentPage}`}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col select-none animate-fadeIn"
    >
      {/* ── Top Header Toolbar ────────────────────────────────────────── */}
      <header className="h-16 px-4 sm:px-6 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0">
        
        {/* Left: Mode toggle & Page info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-base sm:text-lg tracking-tight">
              Page {currentPage}
            </span>
            <span className="text-slate-500 text-xs sm:text-sm">
              of {totalPages}
            </span>
          </div>

          {/* Mode Switcher: All vs Selected */}
          {selectedPages.length > 0 && (
            <div className="hidden sm:flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 ml-2">
              <button
                type="button"
                onClick={() => setMode("all")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  mode === "all"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All ({totalPages})
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("selected");
                  if (!selectedPages.includes(currentPage)) {
                    onPageChange(selectedPages[0]);
                  }
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  mode === "selected"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Selected ({selectedPages.length})
              </button>
            </div>
          )}
        </div>

        {/* Center: Zoom & Rotate Controls */}
        <div className="flex items-center gap-1 sm:gap-2 bg-slate-900/90 border border-slate-800/90 rounded-xl px-2 py-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            title="Zoom Out (-)"
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleResetZoom}
            title="Reset Zoom (0)"
            className="px-2 py-1 text-xs font-mono font-medium text-slate-300 hover:text-white rounded hover:bg-slate-800 transition-all min-w-[50px] text-center"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 2.5}
            title="Zoom In (+)"
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <div className="w-px h-4 bg-slate-800 mx-1 hidden xs:block" />

          <button
            type="button"
            onClick={handleRotate}
            title="Rotate 90° (R)"
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Right: Select Toggle + Close Button */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onToggleSelect(currentPage)}
            className={`relative inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold overflow-hidden border backdrop-blur-xl transition-all duration-300 ease-out active:translate-y-0 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent before:-translate-x-full before:transition-transform before:duration-700 hover:before:translate-x-full cursor-pointer ${
              isSelected
                ? "bg-gradient-to-b from-indigo-500/30 to-indigo-700/25 border-indigo-400/50 text-white shadow-[0_4px_20px_rgba(99,102,241,0.25)] hover:from-indigo-400/40 hover:to-indigo-600/35 hover:border-indigo-300/70 hover:shadow-[0_4px_25px_rgba(99,102,241,0.4)] hover:-translate-y-0.5"
                : "bg-slate-900/60 border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white hover:bg-slate-800/80 hover:-translate-y-0.5"
            }`}
          >
            {isSelected ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="hidden xs:inline">Selected</span>
                <span className="bg-white/20 text-white text-[11px] font-bold px-1.5 py-0.2 rounded">
                  #{selectionOrder}
                </span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                <span>Select Page</span>
              </>
            )}
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 flex items-center justify-center transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Main Preview Stage ────────────────────────────────────────── */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        
        {/* Prev Page Button */}
        <button
          type="button"
          onClick={handlePrev}
          disabled={!hasPrev}
          aria-label="Previous page"
          title="Previous page (Left arrow)"
          className="absolute left-3 sm:left-6 z-20 w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-white flex items-center justify-center shadow-xl backdrop-blur-md transition-all disabled:opacity-20 disabled:cursor-not-allowed active:scale-95 group"
        >
          <svg className="w-6 h-6 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Next Page Button */}
        <button
          type="button"
          onClick={handleNext}
          disabled={!hasNext}
          aria-label="Next page"
          title="Next page (Right arrow)"
          className="absolute right-3 sm:right-6 z-20 w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-white flex items-center justify-center shadow-xl backdrop-blur-md transition-all disabled:opacity-20 disabled:cursor-not-allowed active:scale-95 group"
        >
          <svg className="w-6 h-6 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Scrollable Document Container */}
        <div
          ref={containerRef}
          className="w-full h-full overflow-auto flex items-center justify-center p-4 sm:p-8"
        >
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
              transition: "transform 0.15s ease-out",
            }}
            className="relative flex items-center justify-center shadow-2xl rounded-lg overflow-hidden border border-slate-700/60 bg-slate-900"
          >
            <Document
              file={pdfUrl}
              suspense={false}
              onLoadError={(err) => {
                console.error("PDF Preview Modal Document load error:", err);
              }}
              loading={
                <div
                  style={{ width: pageWidth, height: pageWidth * (4 / 3) }}
                  className="bg-slate-900 flex flex-col items-center justify-center gap-3 animate-pulse text-slate-500"
                >
                  <svg className="animate-spin w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-xs font-medium">Loading page {currentPage}…</span>
                </div>
              }
              error={
                <div
                  style={{ width: pageWidth, height: pageWidth * (4 / 3) }}
                  className="bg-slate-900 flex flex-col items-center justify-center gap-2 text-rose-400"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-sm">Failed to render page {currentPage}</span>
                </div>
              }
            >
              <Page
                pageNumber={currentPage}
                width={pageWidth}
                rotate={currentRotation}
                suspense={false}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onRenderSuccess={() => setPageLoading(false)}
                onRenderError={(err) => {
                  console.error("PDF Preview Modal Page render error:", err);
                }}
                loading={
                  <div
                    style={{ width: pageWidth, height: pageWidth * (4 / 3) }}
                    className="bg-slate-900 flex items-center justify-center text-slate-600 animate-pulse text-xs"
                  >
                    Rendering…
                  </div>
                }
              />
            </Document>
          </div>
        </div>
      </div>

      {/* ── Bottom Strip: Page Thumbnails / Jump Bar & Shortcuts ───────── */}
      <footer className="h-16 px-4 sm:px-6 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between gap-4 sm:gap-6 shrink-0 overflow-hidden">
        {/* Quick jump pills */}
        <div
          ref={pillsContainerRef}
          onWheel={handlePillsWheel}
          className="flex items-center gap-2 overflow-x-auto py-2 scrollbar-none flex-1 scroll-smooth"
        >
          {currentSequence.map((pg, idx) => {
            const isPgSelected = selectedPages.includes(pg);
            const isActive = pg === currentPage;
            return (
              <button
                key={pg}
                data-page={pg}
                type="button"
                onClick={() => {
                  setPageLoading(true);
                  onPageChange(pg);
                }}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-105 ring-2 ring-indigo-400/50"
                    : isPgSelected
                    ? "bg-indigo-950/60 text-indigo-300 border border-indigo-700/40 hover:bg-indigo-900/60"
                    : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700"
                }`}
                title={`Go to page ${pg}`}
              >
                <span>p.{pg}</span>
                {isPgSelected && !isActive && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block align-middle" />
                )}
              </button>
            );
          })}
        </div>

        {/* Shortcuts reference text */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-500 shrink-0 font-medium">
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">←</kbd> <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">→</kbd> Navigate</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">Space</kbd> Toggle</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">R</kbd> Rotate</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">Esc</kbd> Close</span>
        </div>
      </footer>
    </div>
  );
}

