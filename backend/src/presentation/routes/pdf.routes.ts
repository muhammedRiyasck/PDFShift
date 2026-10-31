import { Router } from 'express';
import { PdfController } from '../controllers/PdfController';

export function createPdfRouter(controller: PdfController): Router {
  const router = Router();

  // Presigned S3 upload flow
  router.post('/presign-upload', controller.createPresignedUpload);
  router.post('/confirm-upload', controller.confirmUpload);

  // PDF retrieval and processing
  router.get('/pdf/:id/info', controller.getPdfInfo);
  router.get('/pdf/:id/file', controller.getPdfFile);
  router.post('/pdf/:id/extract', controller.extractPages);
  router.post('/pdf/merge', controller.mergePdfs);
  router.get('/pdf/download/:filename', controller.downloadPdf);

  return router;
}
