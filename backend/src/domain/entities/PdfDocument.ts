export interface PdfDocument {
  id: string;
  originalName: string;
  filename: string;
  pageCount: number;
  uploadedAt: Date;
  filePath: string;
}
