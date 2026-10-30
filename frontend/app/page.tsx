"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { API_BASE } from "@/lib/config";

export default function HomePage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      // 1. Request presigned upload URL from backend
      const presignRes = await axios.post(`${API_BASE}/api/presign-upload`, {
        filename: selectedFile.name,
        contentType: selectedFile.type || "application/pdf",
      });

      const { id, uploadUrl, s3Key } = presignRes.data;

      // 2. Direct upload to AWS S3 via PUT (zero backend bottleneck)
      await axios.put(uploadUrl, selectedFile, {
        headers: {
          "Content-Type": selectedFile.type || "application/pdf",
        },
      });

      // 3. Confirm upload with backend to register metadata & page count
      await axios.post(`${API_BASE}/api/confirm-upload`, {
        id,
        s3Key,
        originalName: selectedFile.name,
        fileSize: selectedFile.size,
      });

      toast.success("PDF uploaded successfully to S3!");
      router.push(`/pdf/${id}`);
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : "Upload failed. Please check S3 credentials and backend.";
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-[#0d1117] to-slate-950 flex flex-col items-center justify-center px-4 py-16 selection:bg-indigo-500 selection:text-white">
      {/* Background ambient decorative glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-indigo-600/15 rounded-full blur-[120px] pointer-events-none" />

      {/* Hero Header */}
      <div className="relative text-center max-w-2xl mx-auto mb-10">
        {/* Brand Logo & Pill */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white text-base font-black shadow-lg shadow-indigo-500/25">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <span className="text-2xl font-black tracking-tight text-white">
            PDF<span className="text-indigo-400">Shift</span>
          </span>
          <span className="ml-1 text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
            v1.0
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
          Shift, Reorder & Extract <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200 bg-clip-text text-transparent">
            Pages from any PDF
          </span>
        </h1>

        <p className="text-slate-400 text-base sm:text-lg leading-relaxed">
          Upload your document, visually select the pages you need, drag to shift the sequence, and generate a new PDF in seconds.
        </p>
      </div>

      {/* Upload Zone Card */}
      <div className="relative w-full max-w-xl">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("file-input")?.click()}
          className={`relative group border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 backdrop-blur-xl
            ${
              isDragging
                ? "border-indigo-400 bg-indigo-500/15 shadow-2xl shadow-indigo-500/20 scale-[1.01]"
                : selectedFile
                ? "border-emerald-500/40 bg-emerald-950/20 shadow-xl shadow-emerald-900/10"
                : "border-slate-800 bg-slate-900/40 hover:border-indigo-500/40 hover:bg-slate-900/60 shadow-xl"
            }`}
        >
          <input
            id="file-input"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileInput}
          />

          {selectedFile ? (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <div>
                <p className="text-white font-semibold text-lg truncate max-w-md mx-auto">
                  {selectedFile.name}
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready to process
                </p>
              </div>

              <span className="inline-block text-xs font-medium text-slate-500 group-hover:text-slate-400 transition-colors">
                Click or drop another file to change
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>

              <div>
                <p className="text-white font-semibold text-lg">
                  {isDragging ? "Drop your PDF right here" : "Choose a PDF or drag & drop"}
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  Supports standard PDF documents up to 50MB
                </p>
              </div>

              <div className="pt-2">
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs font-medium text-slate-200 group-hover:bg-indigo-600 group-hover:border-indigo-500 group-hover:text-white transition-all shadow-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Browse Computer
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Upload Action Button */}
        {selectedFile && (
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="mt-4 w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40 transition-all duration-200 flex items-center justify-center gap-2.5"
          >
            {isUploading ? (
              <>
                <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Direct Upload to S3...</span>
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
      </div>

      {/* Feature cards */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <h2 className="text-white text-sm font-semibold mb-1">Visual Thumbnails</h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            Every page is rendered clearly in a visual grid so you know exactly what you are picking.
          </p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </div>
          <h2 className="text-white text-sm font-semibold mb-1">Drag-and-Drop Order</h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            Easily reorder the selected pages by dragging and dropping them into your desired sequence.
          </p>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <h2 className="text-white text-sm font-semibold mb-1">Instant Extraction</h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            Extract into a clean new PDF file and download immediately right from your browser.
          </p>
        </div>
      </div>
    </main>
  );
}
