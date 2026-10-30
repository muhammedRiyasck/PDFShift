import { Request, Response, NextFunction } from 'express';
import { UploadPdfUseCase } from '../../application/use-cases/UploadPdfUseCase';
import { GetPdfInfoUseCase } from '../../application/use-cases/GetPdfInfoUseCase';
import { ExtractPagesUseCase } from '../../application/use-cases/ExtractPagesUseCase';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

export class PdfController {
  constructor(
    private readonly uploadPdfUseCase: UploadPdfUseCase,
    private readonly getPdfInfoUseCase: GetPdfInfoUseCase,
    private readonly extractPagesUseCase: ExtractPagesUseCase
  ) {}

  uploadPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }
      const id = uuidv4();
      const doc = await this.uploadPdfUseCase.execute(req.file, id);
      res.status(201).json({
        id: doc.id,
        originalName: doc.originalName,
        pageCount: doc.pageCount,
        uploadedAt: doc.uploadedAt,
      });
    } catch (err) {
      next(err);
    }
  };

  getPdfInfo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const doc = await this.getPdfInfoUseCase.execute(id);
      res.json({
        id: doc.id,
        originalName: doc.originalName,
        pageCount: doc.pageCount,
        uploadedAt: doc.uploadedAt,
      });
    } catch (err) {
      next(err);
    }
  };

  getPdfFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const doc = await this.getPdfInfoUseCase.execute(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.originalName}"`);
      res.sendFile(path.resolve(doc.filePath));
    } catch (err) {
      next(err);
    }
  };

  extractPages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { pages } = req.body as { pages: number[] };

      if (!Array.isArray(pages) || pages.length === 0) {
        res.status(400).json({ error: 'pages must be a non-empty array of page numbers' });
        return;
      }

      const outputPath = await this.extractPagesUseCase.execute(id, pages);
      const filename = path.basename(outputPath);
      res.json({ downloadUrl: `/api/pdf/download/${filename}` });
    } catch (err) {
      next(err);
    }
  };

  downloadPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filename } = req.params;
      const outputDir = path.join(process.cwd(), 'outputs');
      const filePath = path.join(outputDir, filename);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(path.resolve(filePath));
    } catch (err) {
      next(err);
    }
  };
}
