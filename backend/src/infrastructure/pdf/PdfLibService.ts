import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';

export class PdfLibService {
  async getPageCount(filePath: string): Promise<number> {
    const fileBuffer = await fs.readFile(filePath);
    const pdfDoc = await PDFDocument.load(fileBuffer);
    return pdfDoc.getPageCount();
  }

  async extractPages(
    sourcePath: string,
    pages: number[],  // 1-indexed
    outputPath: string
  ): Promise<void> {
    const fileBuffer = await fs.readFile(sourcePath);
    const sourcePdf = await PDFDocument.load(fileBuffer);
    const newPdf = await PDFDocument.create();

    for (const pageNum of pages) {
      const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageNum - 1]);
      newPdf.addPage(copiedPage);
    }

    const pdfBytes = await newPdf.save();
    await fs.writeFile(outputPath, pdfBytes);
  }
}
