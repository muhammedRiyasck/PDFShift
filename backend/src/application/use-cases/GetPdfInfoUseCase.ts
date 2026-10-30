import { IPdfRepository } from '../../domain/repositories/IPdfRepository';
import { PdfDocument } from '../../domain/entities/PdfDocument';

export class GetPdfInfoUseCase {
  constructor(private readonly pdfRepository: IPdfRepository) {}

  async execute(id: string): Promise<PdfDocument> {
    const doc = await this.pdfRepository.findById(id);
    if (!doc) throw new Error(`PDF with id "${id}" not found`);
    return doc;
  }
}
