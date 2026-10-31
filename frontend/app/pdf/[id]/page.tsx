"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { API_BASE } from "@/lib/config";
import dynamic from "next/dynamic";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import PDFIcon from "@/components/PDFIcon";

const PDFPageThumbnail = dynamic(() => import("@/components/PDFPageThumbnail"), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-[3/4] bg-slate-900 flex flex-col gap-2 p-3">
      <div className="w-3/4 h-2.5 rounded bg-slate-700 animate-pulse" />
      <div className="w-1/2 h-2 rounded bg-slate-800 animate-pulse" />
      <div className="w-full h-px bg-slate-700/50 mt-1" />
      {[100, 88, 94, 78].map((w, i) => (
        <div key={i} className="h-1.5 rounded bg-slate-700/70 animate-pulse" style={{ width: `${w}%` }} />
      ))}
      <div className="flex-1 rounded bg-slate-800 animate-pulse" />
    </div>
  ),
});

interface PdfInfo {
  id: string;
  originalName: string;
  pageCount: number;
}

interface SortablePageItemProps {
  page: number;
  index: number;
  onRemove: (page: number) => void;
}

function SortablePageItem({ page, index, onRemove }: SortablePageItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: page });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0 relative group touch-manipulation overflow-visible">
      <div
        {...attributes}
        {...listeners}
        className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500/60 hover:bg-indigo-600/10 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing transition-all select-none shadow-sm"
      >
        <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wide leading-none mb-1">#{index + 1}</span>
        <span className="text-white font-bold text-sm leading-none">p{page}</span>
      </div>
      {/* Remove badge */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(page); }}
        aria-label={`Remove page ${page}`}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-400 active:scale-90 text-white flex items-center justify-center shadow-md transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function PdfViewerPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [extractedCount, setExtractedCount] = useState<number>(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/pdf/${id}/info`);
        setPdfInfo(res.data);
        setPdfUrl(`${API_BASE}/api/pdf/${id}/file`);
      } catch {
        toast.error("PDF not found");
        router.push("/");
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, [id, router]);

  const togglePage = useCallback((pageNum: number) => {
    setSelectedPages((prev) =>
      prev.includes(pageNum) ? prev.filter((p) => p !== pageNum) : [...prev, pageNum]
    );
  }, []);

  const removePage = useCallback((pageNum: number) => {
    setSelectedPages((prev) => prev.filter((p) => p !== pageNum));
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSelectedPages((items) => {
        const oldIndex = items.indexOf(active.id as number);
        const newIndex = items.indexOf(over.id as number);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const selectAll = () => {
    if (!pdfInfo) return;
    setSelectedPages(Array.from({ length: pdfInfo.pageCount }, (_, i) => i + 1));
  };

  const clearAll = () => setSelectedPages([]);

  const handleExtract = async () => {
    if (selectedPages.length === 0) {
      toast.error("Please select at least one page");
      return;
    }
    setIsExtracting(true);
    setDownloadUrl(null);
    try {
      const res = await axios.post(`${API_BASE}/api/pdf/${id}/extract`, { pages: selectedPages });
      const url = res.data.downloadUrl.startsWith("http")
        ? res.data.downloadUrl
        : `${API_BASE}${res.data.downloadUrl}`;
      setDownloadUrl(url);
      setExtractedCount(selectedPages.length);
      const a = document.createElement("a");
      a.href = url;
      a.download = "extracted-pages.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`Extracted ${selectedPages.length} page(s) successfully!`);
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : "Extraction failed";
      toast.error(message);
    } finally {
      setIsExtracting(false);
    }
  };

  /* ─── Loading state ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto">
            <svg className="animate-spin w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Loading your PDF</p>
            <p className="text-slate-500 text-xs mt-0.5">This may take a moment…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!pdfInfo) return null;

  const hasSelection = selectedPages.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16]">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80">

        {/* Main nav row */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[60px] flex items-center gap-3 sm:gap-4">

          {/* Back + Brand */}
          <button
            onClick={() => router.push("/")}
            title="Back to home"
            className="flex items-center gap-3 shrink-0 group"
          >
            {/* Back icon */}
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:text-white group-hover:border-indigo-500/50 group-hover:bg-slate-800/80 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </div>

            {/* Brand — desktop */}
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-600/30">
                <svg className="w-[18px] h-[18px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <span className="font-black md:text-2xl text-white tracking-tight leading-none">
                PDF<span className="text-indigo-400">Shift</span>
              </span>
            </div>
          </button>

          {/* Divider */}
          <div className="hidden sm:block w-px h-7 bg-slate-800/80 shrink-0" />

          {/* File info */}
          <div className="flex-1 min-w-0 flex items-center gap-2.5">
            {/* PDF icon chip */}
            <div className="hidden xs:flex shrink-0">
              <PDFIcon size={34} />
            </div>
            <div className="min-w-0">
              <h1
                className="text-white font-semibold truncate text-sm sm:text-[15px] leading-tight"
                title={pdfInfo.originalName}
              >
                {pdfInfo.originalName}
              </h1>
              <p className="text-slate-500 text-[11px] sm:text-xs mt-0.5 flex items-center gap-1.5">
                <span>{pdfInfo.pageCount} {pdfInfo.pageCount === 1 ? "page" : "pages"}</span>
                {hasSelection && (
                  <>
                    <span className="text-slate-700">·</span>
                    <span className="text-indigo-400 font-medium">{selectedPages.length} selected</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Select All — desktop */}
            <button
              onClick={selectAll}
              disabled={selectedPages.length === pdfInfo.pageCount}
              className="hidden sm:inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-xl border border-slate-700/80 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:border-slate-600 hover:text-white transition-all font-medium disabled:opacity-40 active:scale-[0.98] font-medium transition-all disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Select All
            </button>

            {/* Clear — desktop, only when something is selected */}
            {hasSelection && (
              <button
                onClick={clearAll}
                className="hidden sm:inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-xl border border-slate-700/80 bg-slate-900/50 text-slate-400 hover:bg-slate-800 hover:border-rose-500/40 hover:text-rose-400 transition-all font-medium"
              >
                <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}

            {/* Extract button */}
            <button
              onClick={handleExtract}
              disabled={isExtracting || !hasSelection}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${hasSelection && !isExtracting
                  ? "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-600/25 hover:shadow-indigo-500/35"
                  : "bg-slate-800/80 border border-slate-700/80 text-slate-500 cursor-not-allowed"
                }`}
            >
              {isExtracting ? (
                <>
                  <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Extracting…</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>
                    Extract
                    {hasSelection && (
                      <span className="ml-1.5 bg-white/20 rounded px-1.5 py-0.5 text-xs font-bold tabular-nums">
                        {selectedPages.length}
                      </span>
                    )}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Reorder strip (when pages are selected) ────────────── */}
        {  (
          <div className="border-t  border-slate-800/60 bg-slate-900/60 px-4 sm:px-6 py-3 my-2">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between my-2.5">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  <span className="text-sm font-semibold text-slate-300">Page order</span>
                  <span className="text-xs text-slate-500">— drag to rearrange</span>
                </div>
               
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={selectedPages} strategy={horizontalListSortingStrategy}>
                  <div className="flex gap-2 pb-1 pt-2 px-1">
                    {selectedPages.map((page, index) => (
                      <SortablePageItem key={page} page={page} index={index} onRemove={removePage} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>
        )}

        {/* ── Mobile quick-action bar ───────────────────────────── */}
        <div className="sm:hidden flex gap-2 px-4 py-2.5 border-t border-slate-800/60 bg-slate-950/60">
          <button
            onClick={selectAll}
            disabled={selectedPages.length === pdfInfo.pageCount}
            className="flex-1 text-xs py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:border-slate-700 active:scale-[0.98] font-medium disabled:opacity-40 active:scale-[0.98] font-medium transition-all cursor-not-allowed"
          >
            Select All ({pdfInfo.pageCount})
          </button>
          <button
            onClick={clearAll}
            disabled={!selectedPages.length}
            className="flex-1 text-xs py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-rose-400 hover:border-rose-500/30 disabled:opacity-40 active:scale-[0.98] font-medium transition-all cursor-not-allowed"
          >
            Clear ({selectedPages.length})
          </button>
        </div>
      </header>

      {/* ── Success Banner ──────────────────────────────────────────── */}
      {downloadUrl && (
        <div className="bg-gradient-to-r from-emerald-950/80 via-emerald-950/60 to-emerald-950/80 border-b border-emerald-500/25 px-4 sm:px-6 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-emerald-300 font-semibold text-sm">
                  {extractedCount} {extractedCount !== 1 ? "pages" : "page"} extracted successfully!
                </p>
                <p className="text-slate-400 text-xs mt-0.5">
                  Download started automatically — use the button below to re-download.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <a
                href={downloadUrl}
                download="extracted-pages.pdf"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors shadow-md shadow-emerald-600/20"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </a>
              <button
                onClick={() => setDownloadUrl(null)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-all"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Grid ───────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 py-5 sm:py-8">

        {/* Grid header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h2 className="text-white font-semibold text-sm sm:text-base">All Pages</h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              {hasSelection
                ? `${selectedPages.length} of ${pdfInfo.pageCount} pages selected`
                : "Tap a page to select it"}
            </p>
          </div>
          {hasSelection && (
            <button
              onClick={clearAll}
              className="hidden sm:inline-flex text-xs text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 px-3 py-1.5 rounded-lg transition-all font-medium"
            >
              Deselect all
            </button>
          )}
        </div>

        {/* Thumbnail grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: pdfInfo.pageCount }, (_, i) => i + 1).map((pageNum) => {
            const isSelected = selectedPages.includes(pageNum);
            const selectionIndex = selectedPages.indexOf(pageNum);
            return (
              <div
                key={pageNum}
                onClick={() => togglePage(pageNum)}
                className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-150 select-none group
                  ${isSelected
                    ? "border-indigo-500 shadow-lg shadow-indigo-500/25 scale-[1.02]"
                    : "border-slate-800 hover:border-slate-600 hover:shadow-md hover:shadow-black/30"
                  }`}
              >
                {/* Selection number badge */}
                {isSelected && (
                  <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-indigo-600 border-2 border-indigo-400/40 flex items-center justify-center shadow-lg">
                    <span className="text-white text-[10px] font-bold tabular-nums">{selectionIndex + 1}</span>
                  </div>
                )}

                {/* Checkbox */}
                <div className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
                  ${isSelected
                    ? "bg-indigo-600 border-indigo-500 shadow-md"
                    : "border-slate-600/70 bg-slate-950/50 group-hover:border-slate-400"}`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Hover overlay for unselected */}
                {!isSelected && (
                  <div className="absolute inset-0 z-[5] bg-indigo-600/0 group-hover:bg-indigo-600/5 transition-colors" />
                )}

                {/* PDF thumbnail */}
                <div className="bg-slate-900">
                  <PDFPageThumbnail pdfUrl={pdfUrl} pageNumber={pageNum} />
                </div>

                {/* Page label */}
                <div className={`py-1.5 text-center text-xs font-medium tracking-wide transition-colors
                  ${isSelected
                    ? "bg-indigo-600/90 text-white"
                    : "bg-slate-900 text-slate-500 group-hover:text-slate-300"}`}
                >
                  Page {pageNum}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
