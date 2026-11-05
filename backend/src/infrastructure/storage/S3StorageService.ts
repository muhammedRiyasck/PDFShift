import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';

// Ensure .env is loaded regardless of working directory or import hoisting
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { LRUCache } from 'lru-cache';
import { IStorageService } from '../../domain/services/IStorageService';

/**
 * In-process LRU cache for PDF file buffers.
 *
 * - max 15 entries or 150 MB total (safe on Render's 512 MB free tier)
 * - 10-minute TTL — stale enough that short re-edits hit the cache,
 *   fresh enough that we never serve significantly out-of-date data
 */
const bufferCache = new LRUCache<string, Buffer>({
  max: 15,
  maxSize: 150 * 1024 * 1024, // 150 MB
  sizeCalculation: (buf) => buf.length,
  ttl: 1000 * 60 * 10, // 10 minutes
});

export interface S3Config {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}

export class S3StorageService implements IStorageService {
  private s3Client: S3Client | null = null;
  private customConfig?: Partial<S3Config>;

  constructor(config?: Partial<S3Config>) {
    this.customConfig = config;
  }

  private getBucket(): string {
    const bucket = this.customConfig?.bucket || process.env.AWS_S3_BUCKET;
    if (!bucket) {
      throw new Error(
        'AWS_S3_BUCKET is not set in environment variables. Please configure AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY in backend/.env'
      );
    }
    return bucket;
  }

  private getClient(): S3Client {
    if (!this.s3Client) {
      const region = this.customConfig?.region || process.env.AWS_REGION || 'ap-south-1';
      const accessKeyId = this.customConfig?.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = this.customConfig?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
      const endpoint = this.customConfig?.endpoint || process.env.AWS_ENDPOINT;

      this.s3Client = new S3Client({
        region,
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
        ...(accessKeyId && secretAccessKey
          ? {
              credentials: {
                accessKeyId,
                secretAccessKey,
              },
            }
          : {}),
      });
    }
    return this.s3Client;
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 900 // 15 minutes
  ): Promise<string> {
    const bucket = this.getBucket();
    const client = this.getClient();

    // Note: We intentionally do NOT include ContentType in PutObjectCommand for presigning.
    // If ContentType is signed into S3's signature, mobile browsers (like Chrome on Android)
    // that alter Content-Type (e.g. adding charset or sending application/octet-stream for picked files)
    // get rejected by S3 with 403 SignatureDoesNotMatch, which displays as "Network Error".
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  async getFileBuffer(key: string): Promise<Buffer> {
    // Return cached buffer when available — avoids repeated S3 GetObject calls
    // for the same PDF during extract/merge/view operations.
    const cached = bufferCache.get(key);
    if (cached) return cached;

    const bucket = this.getBucket();
    const client = this.getClient();

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await client.send(command);
    if (!response.Body) {
      throw new Error(`S3 object body is empty for key: ${key}`);
    }

    const byteArray = await response.Body.transformToByteArray();
    const buf = Buffer.from(byteArray);

    bufferCache.set(key, buf);
    return buf;
  }

  async uploadFile(
    key: string,
    buffer: Buffer | Uint8Array,
    contentType: string
  ): Promise<void> {
    const bucket = this.getBucket();
    const client = this.getClient();

    // Use the managed Upload utility which automatically switches to multipart
    // for buffers >5 MB, uploading up to 4 parts in parallel. For small buffers
    // it falls back to a single PutObject — behaviour is identical to before.
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      },
      queueSize: 4,            // parallel part uploads
      partSize: 5 * 1024 * 1024, // 5 MB minimum part size (S3 requirement)
    });

    await upload.done();

    // Warm the cache with the freshly uploaded buffer so subsequent reads
    // (e.g. getPdfFile right after extractPages) don't hit S3 again.
    bufferCache.set(key, Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  }

  async getPresignedDownloadUrl(
    key: string,
    downloadFilename?: string,
    expiresInSeconds: number = 3600 // 1 hour
  ): Promise<string> {
    const bucket = this.getBucket();
    const client = this.getClient();

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(downloadFilename
        ? {
            ResponseContentDisposition: `attachment; filename="${encodeURIComponent(downloadFilename)}"`,
          }
        : {}),
    });

    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }
}
