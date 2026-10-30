import { FilePdfRepository } from './infrastructure/repositories/FilePdfRepository';
import { PdfLibService } from './infrastructure/pdf/PdfLibService';
import { UploadPdfUseCase } from './application/use-cases/UploadPdfUseCase';
import { GetPdfInfoUseCase } from './application/use-cases/GetPdfInfoUseCase';
import { ExtractPagesUseCase } from './application/use-cases/ExtractPagesUseCase';
import { PdfController } from './presentation/controllers/PdfController';
import path from 'path';

const outputDir = path.join(process.cwd(), 'outputs');

// Infrastructure
const pdfRepository = new FilePdfRepository();
const pdfLibService = new PdfLibService();

// Use cases
const uploadPdfUseCase = new UploadPdfUseCase(pdfRepository, pdfLibService);
const getPdfInfoUseCase = new GetPdfInfoUseCase(pdfRepository);
const extractPagesUseCase = new ExtractPagesUseCase(pdfRepository, pdfLibService, outputDir);

// Controller
export const pdfController = new PdfController(
  uploadPdfUseCase,
  getPdfInfoUseCase,
  extractPagesUseCase
);
