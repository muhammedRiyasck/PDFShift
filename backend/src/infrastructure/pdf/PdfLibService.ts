import { PDFDocument } from 'pdf-lib';

export class PdfLibService {
  async getPageCount(fileBuffer: Buffer): Promise<number> {
    const pdfDoc = await PDFDocument.load(fileBuffer);
    return pdfDoc.getPageCount();
  }

  async extractPages(
    sourceBuffer: Buffer,
    pages: number[] // 1-indexed
  ): Promise<Uint8Array> {
    const sourcePdf = await PDFDocument.load(sourceBuffer);
    const newPdf = await PDFDocument.create();

    for (const pageNum of pages) {
      const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageNum - 1]);
      newPdf.addPage(copiedPage);
    }

    return await newPdf.save();
  }
}
