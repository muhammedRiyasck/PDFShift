import express from 'express';
import cors from 'cors';
import path from 'path';
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
});
