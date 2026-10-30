import { IStorageService } from '../../domain/services/IStorageService';
import { v4 as uuidv4 } from 'uuid';

export interface PresignedUploadResult {
  id: string;
  uploadUrl: string;
  s3Key: string;
}

export class CreatePresignedUploadUseCase {
  constructor(private readonly storageService: IStorageService) {}

  async execute(filename: string, contentType: string): Promise<PresignedUploadResult> {
    const id = uuidv4();
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `uploads/${id}-${cleanFilename}`;
    const uploadUrl = await this.storageService.getPresignedUploadUrl(s3Key, contentType);

    return {
      id,
      uploadUrl,
      s3Key,
    };
  }
}

