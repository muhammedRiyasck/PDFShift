import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PDFShift — Extract, Reorder & Build Custom PDFs",
  description: "Upload any PDF, visually select pages, shift and reorder them with drag-and-drop, and download your new PDF instantly.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#090d16",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-[#090d16] text-[#f1f5f9] antialiased overflow-x-hidden`}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#1e1e2e",
              color: "#f1f5f9",
              border: "1px solid #4f46e5",
              maxWidth: "90vw",
            },
          }}
        />
      </body>
    </html>
  );
}
