import { IPdfRepository } from '../../domain/repositories/IPdfRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import {
  PdfLibService,
  WatermarkOptions,
  PDFAnnotation,
  PageNumberingOptions,
} from '../../infrastructure/pdf/PdfLibService';
import { v4 as uuidv4 } from 'uuid';

export interface ExtractResult {
  s3Key: string;
  downloadUrl: string;
  filename: string;
}

export class ExtractPagesUseCase {
  constructor(
    private readonly pdfRepository: IPdfRepository,
    private readonly storageService: IStorageService,
    private readonly pdfLibService: PdfLibService
  ) {}

  async execute(
    pdfId: string,
    pages: number[],
    pageRotations?: Record<number, number>,
    watermark?: WatermarkOptions,
    annotations?: PDFAnnotation[],
    pageNumbering?: PageNumberingOptions
  ): Promise<ExtractResult> {
    const doc = await this.pdfRepository.findById(pdfId);
    if (!doc) {
      throw new Error(`PDF with id "${pdfId}" not found`);
    }

    if (pages.length === 0) {
      throw new Error('At least one page must be selected');
    }

    const invalidPages = pages.filter((p) => p < 1 || p > doc.pageCount);
    if (invalidPages.length > 0) {
      throw new Error(
        `Invalid page numbers: ${invalidPages.join(', ')}. Document has ${doc.pageCount} pages.`
      );
    }

    // 1. Fetch source PDF buffer from S3
    const sourceBuffer = await this.storageService.getFileBuffer(doc.s3Key);

    // 2. Extract, rotate, watermark, annotate, and number pages using pdf-lib
    const extractedBytes = await this.pdfLibService.extractPages(
      sourceBuffer,
      pages,
      pageRotations,
      watermark,
      annotations,
      pageNumbering
    );

    // 3. Upload extracted output directly to S3 outputs/
    const outputFilename = `PDFShift-${uuidv4()}.pdf`;
    const outputKey = `outputs/${outputFilename}`;
    await this.storageService.uploadFile(outputKey, extractedBytes, 'application/pdf');

    // 4. Generate presigned download URL
    const cleanOriginalName = doc.originalName.toLowerCase().endsWith('.pdf')
      ? doc.originalName
      : `${doc.originalName}.pdf`;
    const downloadUrl = await this.storageService.getPresignedDownloadUrl(
      outputKey,
      `PDFShift-${cleanOriginalName}`
    );

    return {
      s3Key: outputKey,
      downloadUrl,
      filename: outputFilename,
    };
  }
}
