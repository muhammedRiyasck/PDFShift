import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';

// Ensure .env is loaded regardless of working directory or import hoisting
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IStorageService } from '../../domain/services/IStorageService';

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

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  async getFileBuffer(key: string): Promise<Buffer> {
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
    return Buffer.from(byteArray);
  }

  async uploadFile(
    key: string,
    buffer: Buffer | Uint8Array,
    contentType: string
  ): Promise<void> {
    const bucket = this.getBucket();
    const client = this.getClient();

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await client.send(command);
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
