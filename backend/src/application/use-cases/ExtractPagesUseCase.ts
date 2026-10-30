import { IPdfRepository } from '../../domain/repositories/IPdfRepository';
import { PdfLibService } from '../../infrastructure/pdf/PdfLibService';
import path from 'path';

export class ExtractPagesUseCase {
  constructor(
    private readonly pdfRepository: IPdfRepository,
    private readonly pdfLibService: PdfLibService,
    private readonly outputDir: string
  ) {}

  async execute(id: string, pages: number[]): Promise<string> {
    const doc = await this.pdfRepository.findById(id);
    if (!doc) throw new Error(`PDF with id "${id}" not found`);

    if (!pages || pages.length === 0) {
      throw new Error('No pages selected');
    }

    // Validate page numbers (1-indexed)
    for (const page of pages) {
      if (page < 1 || page > doc.pageCount) {
        throw new Error(`Page ${page} is out of range (1-${doc.pageCount})`);
      }
    }

    const outputFilename = `extracted-${id}-${Date.now()}.pdf`;
    const outputPath = path.join(this.outputDir, outputFilename);

    await this.pdfLibService.extractPages(doc.filePath, pages, outputPath);
    return outputPath;
  }
}
