import { FilePdfRepository } from './infrastructure/repositories/FilePdfRepository';
import { PdfLibService } from './infrastructure/pdf/PdfLibService';
import { S3StorageService } from './infrastructure/storage/S3StorageService';
import { CreatePresignedUploadUseCase } from './application/use-cases/CreatePresignedUploadUseCase';
import { ConfirmUploadUseCase } from './application/use-cases/ConfirmUploadUseCase';
import { GetPdfInfoUseCase } from './application/use-cases/GetPdfInfoUseCase';
import { ExtractPagesUseCase } from './application/use-cases/ExtractPagesUseCase';
import { PdfController } from './presentation/controllers/PdfController';

// Infrastructure
const pdfRepository = new FilePdfRepository();
const pdfLibService = new PdfLibService();
const storageService = new S3StorageService();

// Application Use Cases
const createPresignedUploadUseCase = new CreatePresignedUploadUseCase(storageService);
const confirmUploadUseCase = new ConfirmUploadUseCase(pdfRepository, storageService, pdfLibService);
const getPdfInfoUseCase = new GetPdfInfoUseCase(pdfRepository);
const extractPagesUseCase = new ExtractPagesUseCase(pdfRepository, storageService, pdfLibService);

// Presentation Controller
export const pdfController = new PdfController(
  createPresignedUploadUseCase,
  confirmUploadUseCase,
  getPdfInfoUseCase,
  extractPagesUseCase,
  storageService
);
