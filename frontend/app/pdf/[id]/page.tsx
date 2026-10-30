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

// Dynamically import react-pdf to avoid SSR issues
const PDFPageThumbnail = dynamic(() => import("@/components/PDFPageThumbnail"), {
  ssr: false,
  loading: () => <div className="w-full aspect-[3/4] bg-slate-800 rounded-lg animate-pulse" />,
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex-shrink-0 relative group"
    >
      <div
        {...attributes}
        {...listeners}
        className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing hover:border-indigo-400 transition-colors"
      >
        <span className="text-xs text-slate-400 mb-0.5">#{index + 1}</span>
        <span className="text-white font-bold text-sm">p{page}</span>
      </div>
      <button
        onClick={() => onRemove(page)}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-xs items-center justify-center hidden group-hover:flex transition-all"
      >
        ×
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
    useSensor(PointerSensor),
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
      prev.includes(pageNum)
        ? prev.filter((p) => p !== pageNum)
        : [...prev, pageNum]
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
      const res = await axios.post(`${API_BASE}/api/pdf/${id}/extract`, {
        pages: selectedPages,
      });
      const url = res.data.downloadUrl.startsWith("http") ? res.data.downloadUrl : `${API_BASE}${res.data.downloadUrl}`;
      setDownloadUrl(url);
      setExtractedCount(selectedPages.length);

      // Auto download
      const a = document.createElement("a");
      a.href = url;
      a.download = `extracted-pages.pdf`;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <svg className="animate-spin w-10 h-10 text-indigo-400 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-slate-400">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (!pdfInfo) return null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
            title="Back to home"
          >
            <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:border-slate-700 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </div>
            <div className="hidden md:flex items-center gap-1.5 mr-2">
              <span className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center text-white text-[11px] font-black">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </span>
              <span className="font-bold text-white text-sm">PDF<span className="text-indigo-400">Shift</span></span>
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-semibold truncate text-sm sm:text-base">{pdfInfo.originalName}</h1>
            <p className="text-slate-500 text-xs">{pdfInfo.pageCount} pages total</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors hidden sm:block">
              Select All
            </button>
            <button onClick={clearAll} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors hidden sm:block">
              Clear
            </button>
            <button
              onClick={handleExtract}
              disabled={isExtracting || selectedPages.length === 0}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center gap-2"
            >
              {isExtracting ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Extracting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Extract {selectedPages.length > 0 ? `(${selectedPages.length})` : ""}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Selected pages reorder strip */}
        {selectedPages.length > 0 && (
          <div className="border-t border-slate-800 bg-slate-900/60 px-4 py-2">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-slate-400 font-medium">Selected order (drag to reorder):</span>
                <span className="text-xs text-indigo-400">{selectedPages.length} page{selectedPages.length !== 1 ? "s" : ""}</span>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={selectedPages} strategy={horizontalListSortingStrategy}>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {selectedPages.map((page, index) => (
                      <SortablePageItem key={page} page={page} index={index} onRemove={removePage} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>
        )}
      </header>

      {/* Extraction Success Banner */}
      {downloadUrl && (
        <div className="bg-emerald-950/70 border-b border-emerald-500/30 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-center sm:text-left">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-emerald-300 font-medium text-sm">
                  New PDF ready! ({extractedCount} page{extractedCount !== 1 ? "s" : ""} extracted in custom order)
                </p>
                <p className="text-slate-400 text-xs">
                  Download started automatically. Click the button to download again anytime.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={downloadUrl}
                download="extracted-pages.pdf"
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </a>
              <button
                onClick={() => setDownloadUrl(null)}
                className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile action buttons */}
      <div className="sm:hidden flex gap-2 px-4 py-2 bg-slate-900/50 border-b border-slate-800">
        <button onClick={selectAll} className="flex-1 text-xs py-2 rounded-lg border border-slate-700 text-slate-300">Select All</button>
        <button onClick={clearAll} className="flex-1 text-xs py-2 rounded-lg border border-slate-700 text-slate-300">Clear All</button>
      </div>

      {/* Page Grid */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: pdfInfo.pageCount }, (_, i) => i + 1).map((pageNum) => {
            const isSelected = selectedPages.includes(pageNum);
            const selectionIndex = selectedPages.indexOf(pageNum);
            return (
              <div
                key={pageNum}
                onClick={() => togglePage(pageNum)}
                className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-150 group
                  ${isSelected
                    ? "border-indigo-500 shadow-lg shadow-indigo-500/20 scale-[1.02]"
                    : "border-slate-800 hover:border-slate-600"
                  }`}
              >
                {/* Selection badge */}
                {isSelected && (
                  <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg">
                    <span className="text-white text-xs font-bold">{selectionIndex + 1}</span>
                  </div>
                )}
                {/* Checkbox overlay */}
                <div className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                  ${isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-600 bg-slate-900/50 group-hover:border-slate-400"}`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {/* PDF page thumbnail */}
                <div className="bg-white">
                  <PDFPageThumbnail pdfUrl={pdfUrl} pageNumber={pageNum} />
                </div>
                {/* Page number label */}
                <div className={`py-1.5 text-center text-xs font-medium transition-colors
                  ${isSelected ? "bg-indigo-900/80 text-indigo-200" : "bg-slate-900 text-slate-400"}`}>
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
