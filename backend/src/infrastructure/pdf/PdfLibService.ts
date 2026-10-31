import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';

export interface WatermarkOptions {
  text: string;
  opacity?: number;
  color?: { r: number; g: number; b: number };
}

export interface PageNumberingOptions {
  enabled: boolean;
  format?: 'page_n_of_total' | 'n_slash_total' | 'n_only'; // default 'page_n_of_total'
  position?: 'bottom_center' | 'bottom_right' | 'bottom_left'; // default 'bottom_center'
}

export interface PDFAnnotation {
  pageNum: number;
  type: 'text' | 'redact';
  xRatio: number; // 0 to 1
  yRatio: number; // 0 to 1
  widthRatio?: number; // 0 to 1
  heightRatio?: number; // 0 to 1
  text?: string;
  fontSize?: number;
  color?: string; // 'black' | 'red' | 'blue' | 'white'
  redactStyle?: 'black' | 'white';
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
    watermark?: WatermarkOptions,
    annotations?: PDFAnnotation[],
    pageNumbering?: PageNumberingOptions
  ): Promise<Uint8Array> {
    const sourcePdf = await PDFDocument.load(sourceBuffer);
    const newPdf = await PDFDocument.create();
    let helveticaFont: any = null;

    for (const pageNum of pages) {
      const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageNum - 1]);

      // Apply annotations for this page
      if (annotations && annotations.length > 0) {
        const pageAnns = annotations.filter((a) => a.pageNum === pageNum);
        if (pageAnns.length > 0) {
          if (!helveticaFont) {
            helveticaFont = await newPdf.embedFont(StandardFonts.Helvetica);
          }
          const { width, height } = copiedPage.getSize();

          for (const ann of pageAnns) {
            if (ann.type === 'redact') {
              const boxW = Math.max(10, (ann.widthRatio || 0.25) * width);
              const boxH = Math.max(8, (ann.heightRatio || 0.04) * height);
              const boxX = ann.xRatio * width;
              const boxY = (1 - ann.yRatio) * height - boxH;

              copiedPage.drawRectangle({
                x: Math.max(0, boxX),
                y: Math.max(0, boxY),
                width: boxW,
                height: boxH,
                color: ann.redactStyle === 'white' ? rgb(1, 1, 1) : rgb(0.05, 0.05, 0.05),
              });
            } else if (ann.type === 'text' && ann.text && ann.text.trim().length > 0) {
              const size = ann.fontSize || 14;
              const textX = ann.xRatio * width;
              const textY = (1 - ann.yRatio) * height - size;

              const colorMap: Record<string, any> = {
                black: rgb(0.1, 0.1, 0.1),
                red: rgb(0.85, 0.15, 0.15),
                blue: rgb(0.15, 0.35, 0.85),
                white: rgb(1, 1, 1),
              };
              const textColor = colorMap[ann.color || 'black'] || rgb(0.1, 0.1, 0.1);

              copiedPage.drawText(ann.text.trim(), {
                x: Math.max(0, textX),
                y: Math.max(0, textY),
                size,
                font: helveticaFont,
                color: textColor,
              });
            }
          }
        }
      }

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

    // Apply page numbering if requested
    if (pageNumbering && pageNumbering.enabled) {
      const numFont = await newPdf.embedFont(StandardFonts.Helvetica);
      const createdPages = newPdf.getPages();
      const total = createdPages.length;

      createdPages.forEach((page, idx) => {
        const pNum = idx + 1;
        let numStr = `Page ${pNum} of ${total}`;
        if (pageNumbering.format === 'n_slash_total') {
          numStr = `${pNum} / ${total}`;
        } else if (pageNumbering.format === 'n_only') {
          numStr = `${pNum}`;
        }

        const textSize = 10;
        const textWidth = numFont.widthOfTextAtSize(numStr, textSize);
        const { width } = page.getSize();
        let posX = (width - textWidth) / 2;

        if (pageNumbering.position === 'bottom_right') {
          posX = width - textWidth - 36;
        } else if (pageNumbering.position === 'bottom_left') {
          posX = 36;
        }

        page.drawText(numStr, {
          x: posX,
          y: 20,
          size: textSize,
          font: numFont,
          color: rgb(0.35, 0.35, 0.35),
        });
      });
    }

    return await newPdf.save();
  }

  async mergePdfs(
    sourceBuffers: Buffer[],
    watermark?: WatermarkOptions,
    pageNumbering?: PageNumberingOptions
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

    // Apply page numbering if requested
    if (pageNumbering && pageNumbering.enabled) {
      const numFont = await mergedPdf.embedFont(StandardFonts.Helvetica);
      const createdPages = mergedPdf.getPages();
      const total = createdPages.length;

      createdPages.forEach((page, idx) => {
        const pNum = idx + 1;
        let numStr = `Page ${pNum} of ${total}`;
        if (pageNumbering.format === 'n_slash_total') {
          numStr = `${pNum} / ${total}`;
        } else if (pageNumbering.format === 'n_only') {
          numStr = `${pNum}`;
        }

        const textSize = 10;
        const textWidth = numFont.widthOfTextAtSize(numStr, textSize);
        const { width } = page.getSize();
        let posX = (width - textWidth) / 2;

        if (pageNumbering.position === 'bottom_right') {
          posX = width - textWidth - 36;
        } else if (pageNumbering.position === 'bottom_left') {
          posX = 36;
        }

        page.drawText(numStr, {
          x: posX,
          y: 20,
          size: textSize,
          font: numFont,
          color: rgb(0.35, 0.35, 0.35),
        });
      });
    }

    return await mergedPdf.save();
  }
}
