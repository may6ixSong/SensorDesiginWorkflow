import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  method: 'PUT';
  headers: Record<string, string>;
}

/**
 * S3 호환 presigned URL 발급 (설계서 1.3, 5.4). BE는 파일 바이트를 경유하지 않는다.
 * S3_* 환경변수가 비어있으면(개발자가 로컬에서 아직 채우지 않은 상태) 목(mock) URL을 반환해
 * FE 개발이 막히지 않게 한다.
 */
@Injectable()
export class StorageService {
  constructor(private readonly config: ConfigService) {}

  private get bucket() {
    return this.config.get<string>('storage.bucket') ?? '';
  }

  private get isConfigured() {
    return Boolean(this.bucket) && Boolean(this.config.get<string>('storage.endpoint'));
  }

  buildStorageKey(ipSlug: string, deliverableId: string, version: string, fileName: string) {
    return `${ipSlug}/${deliverableId}/${version}/${randomUUID()}-${fileName}`;
  }

  async createPresignedUpload(
    storageKey: string,
    contentType: string,
  ): Promise<PresignedUploadResult> {
    if (!this.isConfigured) {
      return {
        uploadUrl: `mock://local-storage/${storageKey}`,
        storageKey,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
      };
    }
    // TODO: 실제 S3 SDK(@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner)로 교체.
    // 현재는 개발 단계이므로 presign 로직 자리만 만들어둔다.
    const endpoint = this.config.get<string>('storage.endpoint');
    return {
      uploadUrl: `${endpoint}/${this.bucket}/${storageKey}`,
      storageKey,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    };
  }

  async createPresignedDownload(storageKey: string): Promise<string> {
    if (!this.isConfigured) return `mock://local-storage/${storageKey}`;
    const endpoint = this.config.get<string>('storage.endpoint');
    return `${endpoint}/${this.bucket}/${storageKey}`;
  }
}
