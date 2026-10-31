import { IPdfRepository } from '../../domain/repositories/IPdfRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import {
  PdfLibService,
  WatermarkOptions,
  PageNumberingOptions,
} from '../../infrastructure/pdf/PdfLibService';
import { v4 as uuidv4 } from 'uuid';

export interface MergeResult {
  s3Key: string;
  downloadUrl: string;
  filename: string;
  totalPageCount: number;
}

export class MergePdfsUseCase {
  constructor(
    private readonly pdfRepository: IPdfRepository,
    private readonly storageService: IStorageService,
    private readonly pdfLibService: PdfLibService
  ) {}

  async execute(
    pdfIds: string[],
    watermark?: WatermarkOptions,
    pageNumbering?: PageNumberingOptions
  ): Promise<MergeResult> {
    if (!Array.isArray(pdfIds) || pdfIds.length < 2) {
      throw new Error('At least two PDF documents are required for merging');
    }

    // 1. Fetch document metadata for all IDs
    const docs = [];
    let totalPageCount = 0;
    for (const id of pdfIds) {
      const doc = await this.pdfRepository.findById(id);
      if (!doc) {
        throw new Error(`PDF with id "${id}" not found`);
      }
      docs.push(doc);
      totalPageCount += doc.pageCount;
    }

    // 2. Fetch buffers in the exact order requested
    const buffers: Buffer[] = [];
    for (const doc of docs) {
      const buf = await this.storageService.getFileBuffer(doc.s3Key);
      buffers.push(buf);
    }

    // 3. Merge buffers using pdf-lib
    const mergedBytes = await this.pdfLibService.mergePdfs(buffers, watermark, pageNumbering);

    // 4. Upload merged output to S3
    const outputFilename = `merged-${uuidv4()}.pdf`;
    const outputKey = `outputs/${outputFilename}`;
    await this.storageService.uploadFile(outputKey, mergedBytes, 'application/pdf');

    // 5. Presigned download URL
    const downloadUrl = await this.storageService.getPresignedDownloadUrl(
      outputKey,
      'merged-document.pdf'
    );

    return {
      s3Key: outputKey,
      downloadUrl,
      filename: outputFilename,
      totalPageCount,
    };
  }
}

