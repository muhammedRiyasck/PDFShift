export interface IStorageService {
  /**
   * Generates a presigned PUT URL allowing clients to upload directly to S3.
   */
  getPresignedUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Retrieves file binary data from S3.
   */
  getFileBuffer(key: string): Promise<Buffer>;

  /**
   * Uploads processed file buffer to S3.
   */
  uploadFile(key: string, buffer: Buffer | Uint8Array, contentType: string): Promise<void>;

  /**
   * Generates a presigned GET URL for downloading or viewing the file.
   */
  getPresignedDownloadUrl(key: string, downloadFilename?: string, expiresInSeconds?: number): Promise<string>;
}

