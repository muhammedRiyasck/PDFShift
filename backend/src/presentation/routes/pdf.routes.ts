import { Router } from 'express';
import { PdfController } from '../controllers/PdfController';
import { upload } from '../../infrastructure/storage/MulterUploader';

export function createPdfRouter(controller: PdfController): Router {
  const router = Router();

  router.post('/upload', upload.single('pdf'), controller.uploadPdf);
  router.get('/pdf/:id/info', controller.getPdfInfo);
  router.get('/pdf/:id/file', controller.getPdfFile);
  router.post('/pdf/:id/extract', controller.extractPages);
  router.get('/pdf/download/:filename', controller.downloadPdf);

  return router;
}
