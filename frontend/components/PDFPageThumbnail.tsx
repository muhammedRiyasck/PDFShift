"use client";

import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Set up PDF.js worker from public directory
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

interface PDFPageThumbnailProps {
  pdfUrl: string;
  pageNumber: number;
}

export default function PDFPageThumbnail({ pdfUrl, pageNumber }: PDFPageThumbnailProps) {
  const [containerWidth, setContainerWidth] = useState(200);
  const [error, setError] = useState(false);

  useEffect(() => {
    const updateWidth = () => {
      const cols = window.innerWidth >= 1280 ? 6
        : window.innerWidth >= 1024 ? 5
        : window.innerWidth >= 768 ? 4
        : window.innerWidth >= 640 ? 3
        : 2;
      const padding = 32 + (cols - 1) * 16;
      setContainerWidth(Math.floor((window.innerWidth - padding) / cols) - 4);
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  if (error) {
    return (
      <div className="w-full aspect-[3/4] flex items-center justify-center bg-slate-800 text-slate-500 text-xs">
        Page {pageNumber}
      </div>
    );
  }

  return (
    <Document
      file={pdfUrl}
      onLoadError={() => setError(true)}
      loading={
        <div className="w-full aspect-[3/4] bg-slate-200 animate-pulse" />
      }
    >
      <Page
        pageNumber={pageNumber}
        width={containerWidth}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={
          <div className="w-full aspect-[3/4] bg-slate-200 animate-pulse" />
        }
        error={
          <div className="w-full aspect-[3/4] flex items-center justify-center bg-slate-100 text-slate-400 text-xs">
            p{pageNumber}
          </div>
        }
      />
    </Document>
  );
}
