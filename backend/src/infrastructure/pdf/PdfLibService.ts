import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';

export interface WatermarkOptions {
  text: string;
  opacity?: number;
  color?: { r: number; g: number; b: number };
}

export class PdfLibService {
  async getPageCount(fileBuffer: Buffer): Promise<number> {
    const pdfDoc = await PDFDocument.load(fileBuffer);
    return pdfDoc.getPageCount();
  }

  async extractPages(
    sourceBuffer: Buffer,
    pages: number[], // 1-indexed
    pageRotations?: Record<number, number>,
    watermark?: WatermarkOptions
  ): Promise<Uint8Array> {
    const sourcePdf = await PDFDocument.load(sourceBuffer);
    const newPdf = await PDFDocument.create();

    for (const pageNum of pages) {
      const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageNum - 1]);

      // Apply rotation if requested for this page
      if (pageRotations && pageRotations[pageNum]) {
        const additionalRotation = pageRotations[pageNum] % 360;
        const currentAngle = copiedPage.getRotation().angle;
        copiedPage.setRotation(degrees((currentAngle + additionalRotation) % 360));
      }

      newPdf.addPage(copiedPage);
    }

    // Apply watermark if specified
    if (watermark && watermark.text && watermark.text.trim().length > 0) {
      const font = await newPdf.embedFont(StandardFonts.HelveticaBold);
      const text = watermark.text.trim();
      const opacity = typeof watermark.opacity === 'number' ? watermark.opacity : 0.25;
      const color = watermark.color
        ? rgb(watermark.color.r, watermark.color.g, watermark.color.b)
        : rgb(0.8, 0.2, 0.2);

      const createdPages = newPdf.getPages();
      for (const page of createdPages) {
        const { width, height } = page.getSize();
        const textSize = Math.max(16, Math.min(width, height) / 10);
        const textWidth = font.widthOfTextAtSize(text, textSize);
        const textHeight = font.heightAtSize(textSize);

        // Center diagonal watermark
        page.drawText(text, {
          x: (width - textWidth) / 2,
          y: (height - textHeight) / 2,
          size: textSize,
          font,
          color,
          opacity,
          rotate: degrees(35),
        });
      }
    }

    return await newPdf.save();
  }

  async mergePdfs(
    sourceBuffers: Buffer[],
    watermark?: WatermarkOptions
  ): Promise<Uint8Array> {
    const mergedPdf = await PDFDocument.create();

    for (const buffer of sourceBuffers) {
      const srcDoc = await PDFDocument.load(buffer);
      const pageIndices = srcDoc.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices);
      copiedPages.forEach((p) => mergedPdf.addPage(p));
    }

    if (watermark && watermark.text && watermark.text.trim().length > 0) {
      const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
      const text = watermark.text.trim();
      const opacity = typeof watermark.opacity === 'number' ? watermark.opacity : 0.25;
      const color = watermark.color
        ? rgb(watermark.color.r, watermark.color.g, watermark.color.b)
        : rgb(0.8, 0.2, 0.2);

      const createdPages = mergedPdf.getPages();
      for (const page of createdPages) {
        const { width, height } = page.getSize();
        const textSize = Math.max(16, Math.min(width, height) / 10);
        const textWidth = font.widthOfTextAtSize(text, textSize);
        const textHeight = font.heightAtSize(textSize);

        page.drawText(text, {
          x: (width - textWidth) / 2,
          y: (height - textHeight) / 2,
          size: textSize,
          font,
          color,
          opacity,
          rotate: degrees(35),
        });
      }
    }

    return await mergedPdf.save();
  }
}
