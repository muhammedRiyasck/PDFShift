"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { PDFAnnotation } from "@/types/pdf";

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
  annotations?: PDFAnnotation[];
  onUpdateAnnotations?: (annotations: PDFAnnotation[]) => void;
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
  annotations = [],
  onUpdateAnnotations,
}: PDFPreviewModalProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [localRotation, setLocalRotation] = useState<number>(0);
  const currentRotation = pageRotations ? pageRotations[currentPage] || 0 : localRotation;
  const [mode, setMode] = useState<"all" | "selected">(initialMode);
  const [pageWidth, setPageWidth] = useState<number>(600);
  const [pageLoading, setPageLoading] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<"navigate" | "text" | "redact_black" | "redact_white">("navigate");

  const containerRef = useRef<HTMLDivElement>(null);
  const pillsContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

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
      setActiveTool("navigate");
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
      const availableHeight = containerRef.current.clientHeight - 80;

      const widthBasedOnHeight = availableHeight * (3 / 4);
      const targetWidth = Math.min(availableWidth, widthBasedOnHeight, 900);
      setPageWidth(Math.max(Math.floor(targetWidth), 280));
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isOpen]);

  // Determine navigation sequence based on mode
  const currentSequence =
    mode === "selected" && selectedPages.length > 0
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

  /* ── Annotation Handlers ────────────────────────────────────────── */
  const currentPageAnnotations = annotations.filter((a) => a.pageNum === currentPage);

  const removeAnnotation = (id: string) => {
    onUpdateAnnotations?.(annotations.filter((a) => a.id !== id));
  };

  const updateAnnotationText = (id: string, text: string) => {
    onUpdateAnnotations?.(
      annotations.map((a) => (a.id === id ? { ...a, text } : a))
    );
  };

  const cycleColor = (id: string) => {
    const colors = ["black", "red", "blue", "white"];
    onUpdateAnnotations?.(
      annotations.map((a) => {
        if (a.id !== id) return a;
        const nextIndex = (colors.indexOf(a.color || "black") + 1) % colors.length;
        return { ...a, color: colors[nextIndex] };
      })
    );
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === "navigate") return;
    if ((e.target as HTMLElement).closest("[data-annotation]")) return;

    const overlayEl = overlayRef.current;
    if (!overlayEl) return;
    const rect = overlayEl.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(0.85, (e.clientX - rect.left) / rect.width));
    const yRatio = Math.max(0, Math.min(0.95, (e.clientY - rect.top) / rect.height));

    if (activeTool === "text") {
      const newAnn: PDFAnnotation = {
        id: "ann-" + Date.now(),
        pageNum: currentPage,
        type: "text",
        xRatio,
        yRatio,
        text: "New text note",
        fontSize: 14,
        color: "black",
      };
      onUpdateAnnotations?.([...annotations, newAnn]);
    } else if (activeTool === "redact_black") {
      const newAnn: PDFAnnotation = {
        id: "ann-" + Date.now(),
        pageNum: currentPage,
        type: "redact",
        xRatio: Math.max(0, Math.min(0.7, xRatio)),
        yRatio: Math.max(0, Math.min(0.95, yRatio)),
        widthRatio: 0.25,
        heightRatio: 0.04,
        redactStyle: "black",
      };
      onUpdateAnnotations?.([...annotations, newAnn]);
    } else if (activeTool === "redact_white") {
      const newAnn: PDFAnnotation = {
        id: "ann-" + Date.now(),
        pageNum: currentPage,
        type: "redact",
        xRatio: Math.max(0, Math.min(0.7, xRatio)),
        yRatio: Math.max(0, Math.min(0.95, yRatio)),
        widthRatio: 0.25,
        heightRatio: 0.04,
        redactStyle: "white",
      };
      onUpdateAnnotations?.([...annotations, newAnn]);
    }
  };

  /* ── Drag & Resize Handlers ────────────────────────────────────────── */
  const startDrag = (
    id: string,
    e: React.PointerEvent,
    initialXRatio: number,
    initialYRatio: number
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const overlayEl = overlayRef.current;
    if (!overlayEl) return;
    const overlayRect = overlayEl.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startClientX) / overlayRect.width;
      const deltaY = (moveEvent.clientY - startClientY) / overlayRect.height;

      onUpdateAnnotations?.(
        annotations.map((a) => {
          if (a.id !== id) return a;
          const maxW = a.widthRatio || 0.15;
          const maxH = a.heightRatio || 0.04;
          const newX = Math.max(0, Math.min(1 - maxW, initialXRatio + deltaX));
          const newY = Math.max(0, Math.min(1 - maxH, initialYRatio + deltaY));
          return { ...a, xRatio: newX, yRatio: newY };
        })
      );
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const startResize = (
    id: string,
    e: React.PointerEvent,
    initialWRatio: number,
    initialHRatio: number
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const overlayEl = overlayRef.current;
    if (!overlayEl) return;
    const overlayRect = overlayEl.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaW = (moveEvent.clientX - startClientX) / overlayRect.width;
      const deltaH = (moveEvent.clientY - startClientY) / overlayRect.height;

      onUpdateAnnotations?.(
        annotations.map((a) => {
          if (a.id !== id) return a;
          const newW = Math.max(0.04, Math.min(1 - a.xRatio, initialWRatio + deltaW));
          const newH = Math.max(0.02, Math.min(1 - a.yRatio, initialHRatio + deltaH));
          return { ...a, widthRatio: newW, heightRatio: newH };
        })
      );
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

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
            <span className="text-slate-500 text-xs sm:text-sm">of {totalPages}</span>
          </div>

          {/* Mode Switcher */}
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
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
            className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 flex items-center justify-center transition-all cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Secondary Annotation Toolbar ──────────────────────────────── */}
      <div className="h-11 px-4 sm:px-6 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0 text-xs">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-slate-400 font-medium hidden sm:inline mr-1">Tools:</span>

          <button
            type="button"
            onClick={() => setActiveTool("navigate")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTool === "navigate"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-800/80 text-slate-400 hover:text-white"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Navigate</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool("text")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTool === "text"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-800/80 text-slate-400 hover:text-white"
            }`}
          >
            <span className="font-bold text-xs">T</span>
            <span>Add Text</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool("redact_black")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTool === "redact_black"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-800/80 text-slate-400 hover:text-white"
            }`}
          >
            <span className="w-2.5 h-2.5 bg-black border border-slate-600 rounded-xs inline-block" />
            <span>Blackout</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool("redact_white")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTool === "redact_white"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-800/80 text-slate-400 hover:text-white"
            }`}
          >
            <span className="w-2.5 h-2.5 bg-white border border-slate-400 rounded-xs inline-block" />
            <span>Whiteout</span>
          </button>
        </div>

        {/* Tip status */}
        <div className="text-[11px] text-slate-400 hidden sm:block">
          {activeTool === "navigate" && "Drag items to move • Hover edge to resize"}
          {activeTool === "text" && "Click page to add text note • Drag ⠿ to move"}
          {activeTool === "redact_black" && "Click page to add blackout • Drag to move • Corner to resize"}
          {activeTool === "redact_white" && "Click page to erase/whiteout • Drag to move • Corner to resize"}
        </div>
      </div>

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
        <div ref={containerRef} className="w-full h-full overflow-auto flex items-center justify-center p-4 sm:p-8">
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

            {/* ── Interactive Annotation Overlay Layer ────────────────── */}
            <div
              ref={overlayRef}
              onClick={handleCanvasClick}
              className={`absolute inset-0 z-10 ${
                activeTool !== "navigate"
                  ? "cursor-crosshair pointer-events-auto"
                  : "pointer-events-none"
              }`}
            >
              {currentPageAnnotations.map((ann) => {
                if (ann.type === "redact") {
                  return (
                    <div
                      key={ann.id}
                      data-annotation
                      onPointerDown={(e) =>
                        startDrag(ann.id, e, ann.xRatio, ann.yRatio)
                      }
                      style={{
                        left: `${ann.xRatio * 100}%`,
                        top: `${ann.yRatio * 100}%`,
                        width: `${(ann.widthRatio || 0.25) * 100}%`,
                        height: `${(ann.heightRatio || 0.04) * 100}%`,
                      }}
                      className={`absolute group pointer-events-auto border rounded-xs select-none cursor-move touch-none ${
                        ann.redactStyle === "white"
                          ? "bg-white border-slate-300 shadow-sm"
                          : "bg-black border-slate-900"
                      }`}
                    >
                      {/* Delete button (top-right) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAnnotation(ann.id);
                        }}
                        className="absolute -top-3 -right-3 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold shadow-md cursor-pointer z-20"
                        title="Delete box"
                      >
                        ×
                      </button>

                      {/* Resize handle (bottom-right) */}
                      <div
                        onPointerDown={(e) =>
                          startResize(
                            ann.id,
                            e,
                            ann.widthRatio || 0.25,
                            ann.heightRatio || 0.04
                          )
                        }
                        className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-indigo-500 border border-white rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm"
                        title="Drag corner to resize box"
                      />
                    </div>
                  );
                }

                // Text annotation
                return (
                  <div
                    key={ann.id}
                    data-annotation
                    style={{
                      left: `${ann.xRatio * 100}%`,
                      top: `${ann.yRatio * 100}%`,
                    }}
                    className="absolute group pointer-events-auto flex items-center gap-1 p-1 bg-slate-900/95 border border-slate-600 rounded-lg shadow-xl backdrop-blur-md select-none touch-none"
                  >
                    {/* Drag Grip Handle */}
                    <div
                      onPointerDown={(e) =>
                        startDrag(ann.id, e, ann.xRatio, ann.yRatio)
                      }
                      className="cursor-grab active:cursor-grabbing px-1 py-0.5 text-slate-400 hover:text-white flex items-center justify-center select-none"
                      title="Drag to move text note"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                      </svg>
                    </div>

                    <input
                      type="text"
                      value={ann.text || ""}
                      onChange={(e) => updateAnnotationText(ann.id, e.target.value)}
                      style={{
                        fontSize: `${ann.fontSize || 14}px`,
                        color:
                          ann.color === "red"
                            ? "#ef4444"
                            : ann.color === "blue"
                            ? "#3b82f6"
                            : ann.color === "white"
                            ? "#ffffff"
                            : "#e2e8f0",
                      }}
                      className="bg-transparent border-none outline-none font-sans font-medium px-1 min-w-[80px]"
                      placeholder="Type note..."
                    />

                    <div className="flex items-center gap-1">
                      {/* Cycle color */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          cycleColor(ann.id);
                        }}
                        className="w-3.5 h-3.5 rounded-full border border-slate-500 cursor-pointer"
                        style={{
                          backgroundColor:
                            ann.color === "red"
                              ? "#ef4444"
                              : ann.color === "blue"
                              ? "#3b82f6"
                              : ann.color === "white"
                              ? "#ffffff"
                              : "#1e293b",
                        }}
                        title="Change color"
                      />
                      {/* Delete */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAnnotation(ann.id);
                        }}
                        className="w-4 h-4 rounded text-slate-400 hover:text-rose-400 text-xs flex items-center justify-center cursor-pointer"
                        title="Delete note"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Strip: Page Thumbnails Jump Bar ─────────────────────── */}
      <footer className="h-16 px-4 sm:px-6 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between gap-4 sm:gap-6 shrink-0 overflow-hidden">
        {/* Quick jump pills */}
        <div
          ref={pillsContainerRef}
          onWheel={handlePillsWheel}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 flex-1 min-w-0"
        >
          {currentSequence.map((num) => {
            const isActive = num === currentPage;
            const isSel = selectedPages.includes(num);
            return (
              <button
                key={num}
                data-page={num}
                type="button"
                onClick={() => {
                  setPageLoading(true);
                  onPageChange(num);
                }}
                className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30 scale-105"
                    : isSel
                    ? "bg-slate-800 text-indigo-300 border border-indigo-500/30 hover:bg-slate-700"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                p{num}
              </button>
            );
          })}
        </div>
      </footer>
    </div>
  );
}
