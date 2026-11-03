import { S3PdfRepository } from './infrastructure/repositories/S3PdfRepository';
import { PdfLibService } from './infrastructure/pdf/PdfLibService';
import { S3StorageService } from './infrastructure/storage/S3StorageService';
import { S3Client } from '@aws-sdk/client-s3';
import { CreatePresignedUploadUseCase } from './application/use-cases/CreatePresignedUploadUseCase';
import { ConfirmUploadUseCase } from './application/use-cases/ConfirmUploadUseCase';
import { GetPdfInfoUseCase } from './application/use-cases/GetPdfInfoUseCase';
import { ExtractPagesUseCase } from './application/use-cases/ExtractPagesUseCase';
import { MergePdfsUseCase } from './application/use-cases/MergePdfsUseCase';
import { PdfController } from './presentation/controllers/PdfController';

// Infrastructure
const bucket = process.env.AWS_S3_BUCKET!;
const region = process.env.AWS_REGION || 'ap-south-1';
const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Use S3-backed repository so metadata survives Render restarts
const pdfRepository = new S3PdfRepository(s3Client, bucket);
const pdfLibService = new PdfLibService();
const storageService = new S3StorageService();

// Application Use Cases
const createPresignedUploadUseCase = new CreatePresignedUploadUseCase(storageService);
const confirmUploadUseCase = new ConfirmUploadUseCase(pdfRepository, storageService, pdfLibService);
const getPdfInfoUseCase = new GetPdfInfoUseCase(pdfRepository);
const extractPagesUseCase = new ExtractPagesUseCase(pdfRepository, storageService, pdfLibService);
const mergePdfsUseCase = new MergePdfsUseCase(pdfRepository, storageService, pdfLibService);

// Presentation Controller
export const pdfController = new PdfController(
  createPresignedUploadUseCase,
  confirmUploadUseCase,
  getPdfInfoUseCase,
  extractPagesUseCase,
  mergePdfsUseCase,
  storageService
);
