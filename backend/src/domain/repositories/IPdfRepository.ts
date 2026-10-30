import { PdfDocument } from '../entities/PdfDocument';

export interface IPdfRepository {
  save(doc: PdfDocument): Promise<void>;
  findById(id: string): Promise<PdfDocument | null>;
}
