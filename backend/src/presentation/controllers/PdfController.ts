import { Request, Response, NextFunction } from 'express';
import { CreatePresignedUploadUseCase } from '../../application/use-cases/CreatePresignedUploadUseCase';
import { ConfirmUploadUseCase } from '../../application/use-cases/ConfirmUploadUseCase';
import { GetPdfInfoUseCase } from '../../application/use-cases/GetPdfInfoUseCase';
import { ExtractPagesUseCase } from '../../application/use-cases/ExtractPagesUseCase';
import { IStorageService } from '../../domain/services/IStorageService';

export class PdfController {
  constructor(
    private readonly createPresignedUploadUseCase: CreatePresignedUploadUseCase,
    private readonly confirmUploadUseCase: ConfirmUploadUseCase,
    private readonly getPdfInfoUseCase: GetPdfInfoUseCase,
    private readonly extractPagesUseCase: ExtractPagesUseCase,
    private readonly storageService: IStorageService
  ) {}

  createPresignedUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filename, contentType = 'application/pdf' } = req.body;
      if (!filename) {
        res.status(400).json({ error: 'filename is required' });
        return;
      }

      const result = await this.createPresignedUploadUseCase.execute(filename, contentType);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  confirmUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, s3Key, originalName, fileSize } = req.body;
      if (!id || !s3Key || !originalName) {
        res.status(400).json({ error: 'id, s3Key, and originalName are required' });
        return;
      }

      const doc = await this.confirmUploadUseCase.execute({
        id,
        s3Key,
        originalName,
        fileSize,
      });

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
      const buffer = await this.storageService.getFileBuffer(doc.s3Key);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
      res.send(buffer);
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

      const result = await this.extractPagesUseCase.execute(id, pages);
      res.json({
        downloadUrl: result.downloadUrl,
        filename: result.filename,
      });
    } catch (err) {
      next(err);
    }
  };

  downloadPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filename } = req.params;
      const key = `outputs/${filename}`;
      const downloadUrl = await this.storageService.getPresignedDownloadUrl(key, filename);
      res.redirect(downloadUrl);
    } catch (err) {
      next(err);
    }
  };
}
