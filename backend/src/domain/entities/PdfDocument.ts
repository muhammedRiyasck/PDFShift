export interface PdfDocument {
  id: string;
  originalName: string;
  s3Key: string;
  pageCount: number;
  uploadedAt: Date;
  fileSize?: number;
}
