import { IPdfRepository } from '../../domain/repositories/IPdfRepository';
import { PdfDocument } from '../../domain/entities/PdfDocument';

export class FilePdfRepository implements IPdfRepository {
  private store = new Map<string, PdfDocument>();

  async save(doc: PdfDocument): Promise<void> {
    this.store.set(doc.id, doc);
  }

  async findById(id: string): Promise<PdfDocument | null> {
    return this.store.get(id) ?? null;
  }
}
