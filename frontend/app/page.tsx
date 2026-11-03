"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { API_BASE } from "@/lib/config";
import PDFIcon from "@/components/PDFIcon";

export default function HomePage() {
  const router = useRouter();

  // Mode: "extract" (single document page selector) or "merge" (combine multiple PDFs)
  const [activeTab, setActiveTab] = useState<"extract" | "merge">("extract");

  // Extract mode state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Merge mode state
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState("");
  const [mergedDownloadUrl, setMergedDownloadUrl] = useState<string | null>(null);
  const [mergedPageCount, setMergedPageCount] = useState<number>(0);

  /* ──────────────────────────────────────────────────────────────────────────
     Extract mode helpers
     ────────────────────────────────────────────────────────────────────────── */
  const validateAndSetFile = (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are allowed");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File size must be under 50MB");
      return;
    }
    setSelectedFile(file);
  };

  const uploadSingleFileToS3 = async (file: File): Promise<string> => {
    const effectiveContentType = file.type && file.type.length > 0 ? file.type : "application/pdf";

    // 1. Request presigned upload URL from backend
    let presignRes;
    try {
      presignRes = await axios.post(`${API_BASE}/api/presign-upload`, {
        filename: file.name,
        contentType: effectiveContentType,
      });
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error || err.message : String(err);
      throw new Error(`Step 1 (Presign) failed: ${msg}`);
    }

    const { id, uploadUrl, s3Key } = presignRes.data;

    // 2. Direct upload to AWS S3 via native fetch PUT (resilient on mobile browsers)
    try {
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": effectiveContentType,
        },
      });

      if (!uploadRes.ok) {
        throw new Error(`S3 rejected upload with HTTP status ${uploadRes.status}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Step 2 (Storage Upload) failed: ${msg}`);
    }

    // 3. Confirm upload with backend to register metadata & page count
    try {
      await axios.post(`${API_BASE}/api/confirm-upload`, {
        id,
        s3Key,
        originalName: file.name,
        fileSize: file.size,
      });
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error || err.message : String(err);
      throw new Error(`Step 3 (Confirm) failed: ${msg}`);
    }

    return id;
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      const id = await uploadSingleFileToS3(selectedFile);
      toast.success("Document loaded securely!");
      router.push(`/pdf/${id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : "Failed to load document securely. Please try again.";
      toast.error(message, { duration: 5000 });
    } finally {
      setIsUploading(false);
    }
  };

  /* ──────────────────────────────────────────────────────────────────────────
     Merge mode helpers
     ────────────────────────────────────────────────────────────────────────── */
  const addMergeFiles = (files: FileList | File[]) => {
    const valid: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        if (f.size <= 50 * 1024 * 1024) {
          valid.push(f);
        } else {
          toast.error(`"${f.name}" exceeds the 50MB limit`);
        }
      } else {
        toast.error(`"${f.name}" is not a valid PDF`);
      }
    }
    if (valid.length > 0) {
      setMergeFiles((prev) => [...prev, ...valid]);
      setMergedDownloadUrl(null);
    }
  };

  const removeMergeFile = (index: number) => {
    setMergeFiles((prev) => prev.filter((_, i) => i !== index));
    setMergedDownloadUrl(null);
  };

  const moveMergeFile = (index: number, direction: "up" | "down") => {
    setMergeFiles((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleMerge = async () => {
    if (mergeFiles.length < 2) {
      toast.error("Please add at least 2 PDF files to merge");
      return;
    }
    setIsMerging(true);
    setMergedDownloadUrl(null);

    try {
      // 1. Upload all files sequentially to avoid saturating browser bandwidth
      const uploadedIds: string[] = [];
      for (let i = 0; i < mergeFiles.length; i++) {
        setMergeProgress(`Uploading document ${i + 1} of ${mergeFiles.length}...`);
        const id = await uploadSingleFileToS3(mergeFiles[i]);
        uploadedIds.push(id);
      }

      // 2. Call backend merge endpoint
      setMergeProgress("Merging and assembling documents...");
      const mergeRes = await axios.post(`${API_BASE}/api/pdf/merge`, {
        pdfIds: uploadedIds,
      });

      const url = mergeRes.data.downloadUrl.startsWith("http")
        ? mergeRes.data.downloadUrl
        : `${API_BASE}${mergeRes.data.downloadUrl}`;

      setMergedDownloadUrl(url);
      setMergedPageCount(mergeRes.data.totalPageCount || 0);

      // Trigger auto download
      const a = document.createElement("a");
      a.href = url;
      a.download = "merged-document.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.success(`Merged ${mergeFiles.length} PDFs successfully!`);
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : "Failed to merge PDF files";
      toast.error(message);
    } finally {
      setIsMerging(false);
      setMergeProgress("");
    }
  };

  /* ──────────────────────────────────────────────────────────────────────────
     Drag and drop handling
     ────────────────────────────────────────────────────────────────────────── */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (activeTab === "extract") {
        const file = e.dataTransfer.files[0];
        if (file) validateAndSetFile(file);
      } else {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          addMergeFiles(e.dataTransfer.files);
        }
      }
    },
    [activeTab]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeTab === "extract") {
      const file = e.target.files?.[0];
      if (file) validateAndSetFile(file);
    } else {
      if (e.target.files && e.target.files.length > 0) {
        addMergeFiles(e.target.files);
      }
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-[#0d1117] to-slate-950 flex flex-col items-center justify-center px-4 py-10 sm:py-16 selection:bg-indigo-500 selection:text-white relative overflow-x-hidden">
      {/* Background ambient decorative glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[500px] h-[250px] sm:h-[350px] bg-indigo-600/15 rounded-full blur-[90px] sm:blur-[120px] pointer-events-none" />

      {/* Hero Header */}
      <div className="relative text-center max-w-2xl mx-auto mb-6 sm:mb-8 px-2">
        {/* Brand Logo & Pill */}
        <div className="flex items-center justify-center gap-2.5 sm:gap-3 mb-5 sm:mb-6">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white text-base font-black shadow-lg shadow-indigo-500/25 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <span className="text-xl sm:text-2xl font-black tracking-tight text-white">
            PDF<span className="text-indigo-400">Shift</span>
          </span>
          <span className="ml-1 text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
            v2.0
          </span>
        </div>

        {/* Mobile hero text — same-cell grid trick:
            All 3 divs share grid-area 1/1 at FULL width.
            Container height = max(extract, merge) — no half-width wrapping issue. */}
        <div className="sm:hidden grid">
          {/* Ghost A: Extract content (invisible, full width) */}
          <div aria-hidden className="[grid-area:1/1] invisible pointer-events-none select-none flex flex-col gap-2.5">
            <h1 className="text-[1.75rem] font-extrabold tracking-tight leading-snug">
              Reorder & Extract{" "}
              <span>Pages from any PDF</span>
            </h1>
            <p className="text-sm leading-relaxed">
              Upload your document, visually select the pages you need, drag to shift sequence,edit,add stamp and more to your pdf.
            </p>
          </div>

          {/* Ghost B: Merge content (invisible, full width) */}
          <div aria-hidden className="[grid-area:1/1] invisible pointer-events-none select-none flex flex-col gap-2.5">
            <h1 className="text-[1.75rem] font-extrabold tracking-tight leading-snug">
              Combine & Merge{" "}
              <span>Multiple PDFs in Seconds</span>
            </h1>
            <p className="text-sm leading-relaxed">
              Select multiple PDF files, arrange them into your preferred reading sequence, and combine them into one document.
            </p>
          </div>

          {/* Real visible content — same cell, always on top */}
          <div className="[grid-area:1/1] flex flex-col gap-2.5">
            <h1 className="text-[1.75rem] font-extrabold tracking-tight text-white leading-snug">
              {activeTab === "extract" ? (
                <>
                  Reorder & Extract{" "}
                  <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200 bg-clip-text text-transparent">
                    Pages from any PDF
                  </span>
                </>
              ) : (
                <>
                  Combine & Merge{" "}
                  <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200 bg-clip-text text-transparent">
                    Multiple PDFs in Seconds
                  </span>
                </>
              )}
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              {activeTab === "extract"
                ? "Upload your document, visually select the pages you need, drag to shift sequence,edit,add stamp and more to your pdf."
                : "Select multiple PDF files, arrange them into your preferred reading sequence, and combine them into one document."}
            </p>
          </div>
        </div>

        {/* Desktop/tablet (sm+): normal flow, no fixed height needed */}
        <div className="hidden sm:block">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-3 leading-tight">
            {activeTab === "extract" ? (
              <>
                Shift, Reorder & Extract <br />
                <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200 bg-clip-text text-transparent">
                  Pages from any PDF
                </span>
              </>
            ) : (
              <>
                Combine & Merge <br />
                <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200 bg-clip-text text-transparent">
                  Multiple PDFs in Seconds
                </span>
              </>
            )}
          </h1>
          <p className="text-slate-400 text-base leading-relaxed max-w-xl mx-auto">
            {activeTab === "extract"
              ? "Upload your document, visually select the pages you need, drag to shift sequence, and download."
              : "Select multiple PDF files, arrange them into your preferred reading sequence, and combine them into one document."}
          </p>
        </div>

        {/* Feature Mode Switcher Tabs */}
        <div className="flex items-center justify-center gap-2 mt-6">
          <div className="bg-slate-900/90 border border-slate-800 p-1 rounded-2xl flex items-center shadow-lg">
            <button
              type="button"
              onClick={() => setActiveTab("extract")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "extract"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Extract & Reorder</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("merge")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "merge"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
              <span>Merge PDFs</span>
              <span className="px-1.5 py-0.2 rounded bg-indigo-400/20 text-indigo-300 text-[10px] uppercase font-bold tracking-wider">
                New
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Card — fixed min-height on mobile/tablet prevents layout jump on tab switch */}
      <div className="relative w-full max-w-xl px-0 sm:px-2 min-h-[220px] sm:min-h-0">
        {/* Hidden File Input */}
        <input
          id="file-input"
          type="file"
          accept="application/pdf"
          multiple={activeTab === "merge"}
          className="hidden"
          onChange={handleFileInput}
        />

        {/* ─── Mode 1: Extract & Reorder (Single Document) ────────────── */}
        {activeTab === "extract" && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-input")?.click()}
              className={`relative group border-2 border-dashed rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-12 min-h-[200px] sm:min-h-0 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 backdrop-blur-xl ${
                isDragging
                  ? "border-indigo-400 bg-indigo-500/15 shadow-2xl shadow-indigo-500/20 scale-[1.01]"
                  : selectedFile
                  ? "border-emerald-500/40 bg-emerald-950/20 shadow-xl shadow-emerald-900/10"
                  : "border-slate-800 bg-slate-900/40 hover:border-indigo-500/40 hover:bg-slate-900/60 shadow-xl"
              }`}
            >
              {selectedFile ? (
                <div className="space-y-3.5 sm:space-y-4">
                  <div className="relative flex justify-center">
                    <PDFIcon size={56} />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        const input = document.getElementById("file-input") as HTMLInputElement;
                        if (input) input.value = "";
                      }}
                      aria-label="Remove selected file"
                      className="absolute -top-8 -right-5 w-6 h-6 rounded hover:bg-rose-400 active:scale-90 text-white flex items-center justify-center shadow-lg transition-all"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div>
                    <p className="text-white font-semibold text-base sm:text-lg truncate max-w-[240px] xs:max-w-xs sm:max-w-md mx-auto" title={selectedFile.name}>
                      {selectedFile.name}
                    </p>
                    <p className="text-slate-400 text-xs sm:text-sm mt-1">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready to process
                    </p>
                  </div>

                  <span className="inline-block text-[11px] sm:text-xs md:text-lg font-medium text-slate-500 group-hover:text-slate-400 transition-colors">
                    Click or drop another file to change
                  </span>
                </div>
              ) : (
                <div className="space-y-3.5 sm:space-y-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>

                  <div>
                    <p className="text-white font-semibold text-base sm:text-lg">
                      {isDragging ? "Drop your PDF right here" : "Choose a PDF or drag & drop"}
                    </p>
                    <p className="text-slate-400 text-xs sm:text-sm mt-1">
                      Supports standard PDF documents up to 50MB
                    </p>
                  </div>

              
                </div>
              )}
            </div>

            {selectedFile && (
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className={`relative w-full mt-4 py-3.5 px-6 rounded-2xl
                  inline-flex items-center justify-center gap-2.5
                  overflow-hidden border backdrop-blur-xl
                  text-sm sm:text-base font-semibold
                  transition-all duration-300 ease-out
                  ${
                    !isUploading
                      ? "bg-gradient-to-b from-indigo-500/25 to-indigo-700/20 border-indigo-400/40 text-indigo-100 shadow-[0_4px_20px_rgba(99,102,241,0.18)] hover:from-indigo-400/35 hover:to-indigo-600/30 hover:border-indigo-300/60 hover:text-white hover:shadow-[0_4px_25px_rgba(99,102,241,0.35)] hover:-translate-y-0.5 active:translate-y-0"
                      : "bg-slate-800/40 border-white/5 text-slate-500 opacity-60 cursor-not-allowed"
                  }
                  before:absolute before:inset-0
                  before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent
                  before:-translate-x-full
                  before:transition-transform before:duration-700
                  enabled:hover:before:translate-x-full
                  disabled:cursor-not-allowed cursor-pointer`}
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Securing & Loading Document...</span>
                  </>
                ) : (
                  <>
                    <span>Open in Page Selector</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </>
        )}

        {/* ─── Mode 2: Merge Multiple PDFs ────────────────────────────── */}
        {activeTab === "merge" && (
          <div className="space-y-4">
            {/* Merge Drop Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-input")?.click()}
              className={`border-2 border-dashed rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-12 min-h-[200px] sm:min-h-0 text-center cursor-pointer transition-all duration-300 backdrop-blur-xl ${
                isDragging
                  ? "border-indigo-400 bg-indigo-500/15 shadow-2xl scale-[1.01]"
                  : "border-slate-800 bg-slate-900/40 hover:border-indigo-500/40 hover:bg-slate-900/60"
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-3.5 sm:gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-semibold text-base sm:text-lg">
                    Click to select multiple PDFs or drag them here
                  </p>
                  <p className="text-slate-400 text-xs sm:text-sm mt-1">
                    Select 2 or more files to combine into one
                  </p>
                </div>
              </div>
            </div>

            {/* Merge File List */}
            {mergeFiles.length > 0 && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-2.5 backdrop-blur-md">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 px-1">
                  <span className="text-white font-semibold text-xs uppercase tracking-wider">
                    Merge Sequence ({mergeFiles.length} files)
                  </span>
                  <button
                    type="button"
                    onClick={() => setMergeFiles([])}
                    className="text-xs text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    Clear All
                  </button>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {mergeFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-all gap-3"
                    >
                      {/* Left: Sequence badge & Name */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-white text-xs sm:text-sm font-medium truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-slate-500 text-[10px]">
                            {(file.size / (1024 * 1024)).toFixed(2)} MB
                          </p>
                        </div>
                      </div>

                      {/* Right: Reorder buttons & Remove */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveMergeFile(idx, "up")}
                          disabled={idx === 0}
                          title="Move Up"
                          className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-20 flex items-center justify-center transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => moveMergeFile(idx, "down")}
                          disabled={idx === mergeFiles.length - 1}
                          title="Move Down"
                          className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-20 flex items-center justify-center transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => removeMergeFile(idx)}
                          title="Remove file"
                          className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-all ml-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Merge Action Button */}
                <button
                  type="button"
                  onClick={handleMerge}
                  disabled={isMerging || mergeFiles.length < 2}
                  className={`relative w-full mt-3 py-3.5 px-6 rounded-2xl
                    inline-flex items-center justify-center gap-2.5
                    overflow-hidden border backdrop-blur-xl
                    text-sm sm:text-base font-semibold
                    transition-all duration-300 ease-out
                    ${
                      !isMerging && mergeFiles.length >= 2
                        ? "bg-gradient-to-b from-indigo-500/25 to-indigo-700/20 border-indigo-400/40 text-indigo-100 shadow-[0_4px_20px_rgba(99,102,241,0.18)] hover:from-indigo-400/35 hover:to-indigo-600/30 hover:border-indigo-300/60 hover:text-white hover:shadow-[0_4px_25px_rgba(99,102,241,0.35)] hover:-translate-y-0.5 active:translate-y-0"
                        : "bg-slate-800/40 border-white/5 text-slate-500 opacity-60 cursor-not-allowed"
                    }
                    before:absolute before:inset-0
                    before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent
                    before:-translate-x-full
                    before:transition-transform before:duration-700
                    enabled:hover:before:translate-x-full
                    disabled:cursor-not-allowed cursor-pointer`}
                >
                  {isMerging ? (
                    <>
                      <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>{mergeProgress || "Merging documents..."}</span>
                    </>
                  ) : (
                    <>
                      <span>Merge {mergeFiles.length} Documents</span>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Merge Success Banner */}
            {mergedDownloadUrl && (
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-emerald-300 font-semibold text-xs sm:text-sm">
                      Merged into {mergedPageCount} pages!
                    </p>
                    <p className="text-slate-400 text-[11px]">
                      Downloaded automatically. Click below to re-download.
                    </p>
                  </div>
                </div>

                <a
                  href={mergedDownloadUrl}
                  download="merged-document.pdf"
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all shrink-0"
                >
                  Download
                </a>
              </div>
            )}
          </div>
        )}

        {/* Security & Privacy Trust Badge */}
        <div className="flex items-center justify-center gap-2 mt-4 text-[11px] sm:text-xs text-slate-400 font-medium text-center px-2">
          <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>End-to-End Encrypted Transfer.</span>
        </div>
      </div>

      {/* Feature cards */}
      <div className="mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 w-full max-w-3xl">
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 sm:p-5 backdrop-blur-sm">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <h2 className="text-white text-sm font-semibold mb-1">Visual Thumbnails</h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            Every page is rendered clearly in a visual grid with live rotation and lightbox previews.
          </p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 sm:p-5 backdrop-blur-sm">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
          </div>
          <h2 className="text-white text-sm font-semibold mb-1">PDF Merge</h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            Combine multiple separate PDF files into one consolidated document with custom sequence.
          </p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 sm:p-5 backdrop-blur-sm sm:col-span-2 lg:col-span-1">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-white text-sm font-semibold mb-1">Watermark & Stamps</h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            Stamp CONFIDENTIAL, DRAFT, or custom text with adjustable opacity and colors on export.
          </p>
        </div>
      </div>
    </main>
  );
}
