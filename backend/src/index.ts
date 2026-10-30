import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';

// Robustly resolve .env location regardless of launch directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import express from 'express';
import cors from 'cors';
import { createPdfRouter } from './presentation/routes/pdf.routes';
import { errorHandler } from './presentation/middlewares/errorHandler';
import { pdfController } from './container';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', createPdfRouter(pdfController));

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`PDF Extractor backend running on http://localhost:${PORT}`);
  console.log(`Loaded AWS S3 Bucket: ${process.env.AWS_S3_BUCKET || '(Not configured)'}`);
});
