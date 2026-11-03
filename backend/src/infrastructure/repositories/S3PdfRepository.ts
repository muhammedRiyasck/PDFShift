/**
 * S3PdfRepository
 *
 * Persists PdfDocument metadata as individual JSON files in S3
 * (under the `meta/` prefix). This survives Render free-tier
 * restarts that wipe the in-memory FilePdfRepository.
 *
 * Object key: meta/<id>.json
 */

import { IPdfRepository } from '../../domain/repositories/IPdfRepository';
import { PdfDocument } from '../../domain/entities/PdfDocument';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  NoSuchKey,
} from '@aws-sdk/client-s3';

export class S3PdfRepository implements IPdfRepository {
  private cache = new Map<string, PdfDocument>(); // in-process cache to avoid repeated S3 reads

  constructor(private readonly s3Client: S3Client, private readonly bucket: string) {}

  private metaKey(id: string): string {
    return `meta/${id}.json`;
  }

  async save(doc: PdfDocument): Promise<void> {
    const body = JSON.stringify({
      ...doc,
      uploadedAt: doc.uploadedAt instanceof Date ? doc.uploadedAt.toISOString() : doc.uploadedAt,
    });

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.metaKey(doc.id),
        Body: body,
        ContentType: 'application/json',
      })
    );

    this.cache.set(doc.id, doc);
  }

  async findById(id: string): Promise<PdfDocument | null> {
    // Return from cache if available (avoids S3 round-trip within the same process lifetime)
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.metaKey(id),
        })
      );

      if (!response.Body) return null;

      const raw = await response.Body.transformToString('utf-8');
      const parsed = JSON.parse(raw) as PdfDocument & { uploadedAt: string };
      const doc: PdfDocument = {
        ...parsed,
        uploadedAt: new Date(parsed.uploadedAt),
      };

      this.cache.set(id, doc);
      return doc;
    } catch (err: unknown) {
      // S3 throws NoSuchKey when the object doesn't exist
      if (err instanceof NoSuchKey || (err as { name?: string }).name === 'NoSuchKey') {
        return null;
      }
      throw err;
    }
  }
}
