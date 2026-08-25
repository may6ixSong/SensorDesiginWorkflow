import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initObjectStoreClient, ObjectStoreClient, StoreObject } from '@relaycorp/object-storage';
import { randomUUID } from 'crypto';

/**
 * S3 호환 오브젝트 스토리지. SFM_API(src/files/files.service.ts)와 동일하게
 * @relaycorp/object-storage 클라이언트를 쓰고, 파일 바이트는 API가 직접 중계한다
 * (presigned URL 방식이 아니다).
 *
 * 모든 키는 S3_FOLDER prefix 아래에 놓인다 - dev는 siren-dev/, prod는 siren/.
 * S3_* 값이 비어 있으면 클라이언트를 만들지 않고, 업로드/다운로드 호출 시
 * 503을 던진다(조용히 목 데이터를 돌려주지 않는다).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: ObjectStoreClient | null;
  private readonly bucketName: string;
  private readonly prefix: string;

  constructor(private readonly config: ConfigService) {
    this.bucketName = this.config.get<string>('storage.bucketName') ?? '';
    this.prefix = this.config.get<string>('storage.folder') ?? '';
    const uri = this.config.get<string>('storage.uri') ?? '';
    const accessKeyId = this.config.get<string>('storage.accessKeyId') ?? '';
    const secretAccessKey = this.config.get<string>('storage.secretAccessKey') ?? '';

    if (uri && this.bucketName && accessKeyId && secretAccessKey) {
      // 5번째 인자 tlsEnabled=false - SFM_API와 동일 (사내 S3는 endpoint에 스킴을 포함한다).
      this.client = initObjectStoreClient('s3', uri, accessKeyId, secretAccessKey, false);
    } else {
      this.client = null;
      this.logger.warn(
        'S3_* 환경변수가 비어 있어 오브젝트 스토리지를 초기화하지 않았습니다. ' +
          '업로드/다운로드 요청은 503으로 거부됩니다.',
      );
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  private require(): ObjectStoreClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Object storage is not configured. Set S3_URI / S3_BUCKET_NAME / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY.',
      );
    }
    return this.client;
  }

  /** `{prefix}/{ipId}/{deliverableId}/{version}/{uuid}-{fileName}` */
  buildStorageKey(ipId: string, deliverableId: string, version: string, fileName: string): string {
    const key = `${ipId}/${deliverableId}/${version}/${randomUUID()}-${fileName}`;
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async upload(
    storageKey: string,
    body: Buffer,
    metadata: Record<string, string> = {},
  ): Promise<string> {
    const object: StoreObject = { metadata, body };
    await this.require().putObject(object, storageKey, this.bucketName);
    return storageKey;
  }

  /** 객체가 없으면 null. */
  async download(storageKey: string): Promise<Buffer | null> {
    const object = await this.require().getObject(storageKey, this.bucketName);
    return object?.body ?? null;
  }

  async remove(storageKey: string): Promise<void> {
    await this.require().deleteObject(storageKey, this.bucketName);
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    const full = this.prefix ? `${this.prefix}/${prefix}` : prefix;
    for await (const key of this.require().listObjectKeys(full, this.bucketName)) {
      keys.push(key);
    }
    return keys;
  }
}
