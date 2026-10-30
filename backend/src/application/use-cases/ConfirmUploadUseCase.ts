import { IPdfRepository } from '../../domain/repositories/IPdfRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { PdfLibService } from '../../infrastructure/pdf/PdfLibService';
import { PdfDocument } from '../../domain/entities/PdfDocument';

export interface ConfirmUploadDTO {
  id: string;
  s3Key: string;
  originalName: string;
  fileSize?: number;
}

export class ConfirmUploadUseCase {
  constructor(
    private readonly pdfRepository: IPdfRepository,
    private readonly storageService: IStorageService,
    private readonly pdfLibService: PdfLibService
  ) {}

  async execute(dto: ConfirmUploadDTO): Promise<PdfDocument> {
    const buffer = await this.storageService.getFileBuffer(dto.s3Key);
    const pageCount = await this.pdfLibService.getPageCount(buffer);

    const doc: PdfDocument = {
      id: dto.id,
      originalName: dto.originalName,
      s3Key: dto.s3Key,
      pageCount,
      uploadedAt: new Date(),
      fileSize: dto.fileSize,
    };

    await this.pdfRepository.save(doc);
    return doc;
  }
}

