import { IPdfRepository } from '../../domain/repositories/IPdfRepository';
import { PdfDocument } from '../../domain/entities/PdfDocument';
import { PdfLibService } from '../../infrastructure/pdf/PdfLibService';

export class UploadPdfUseCase {
  constructor(
    private readonly pdfRepository: IPdfRepository,
    private readonly pdfLibService: PdfLibService
  ) {}

  async execute(file: Express.Multer.File, id: string): Promise<PdfDocument> {
    const pageCount = await this.pdfLibService.getPageCount(file.path);
    const doc: PdfDocument = {
      id,
      originalName: file.originalname,
      filename: file.filename,
      pageCount,
      uploadedAt: new Date(),
      filePath: file.path,
    };
    await this.pdfRepository.save(doc);
    return doc;
  }
}
