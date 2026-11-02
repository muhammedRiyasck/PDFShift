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

// If ALLOWED_ORIGINS is set, restrict to those; otherwise allow all origins (open API).
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : null;

app.use(
  cors({
    origin: (origin, callback) => {
      // Always allow requests with no origin (mobile apps, curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      // If no whitelist configured, allow all origins
      if (!allowedOrigins) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  })
);
app.use(express.json());

// Health check (keeps Render free tier alive via external pinger)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/api', createPdfRouter(pdfController));

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`PDF Extractor backend running on http://localhost:${PORT}`);
  console.log(`Loaded AWS S3 Bucket: ${process.env.AWS_S3_BUCKET || '(Not configured)'}`);
});
