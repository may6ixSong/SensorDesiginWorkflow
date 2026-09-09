import { Injectable, Logger } from '@nestjs/common';
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
          '인메모리 스토리지로 동작합니다 - 프로세스를 재시작하면 올린 파일이 사라집니다. ' +
          '(DB의 인메모리 목업 모드와 같은 취지의 개발용 폴백입니다.)',
      );
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * S3가 없을 때 쓰는 개발용 인메모리 스토리지. DB가 DB_CONNECTION 없이 인메모리로
   * 도는 것과 같은 취지다 - 실제 스토리지 없이도 등록→업로드→릴리스 흐름 전체를
   * 돌려볼 수 있어야 Observer 계약을 실제로 검증할 수 있다.
   */
  private readonly memory = new Map<string, Buffer>();

  /** `{prefix}/{projectId}/{artifactId}/{version}/{uuid}-{fileName}` */
  buildStorageKey(workflowId: string, deliverableId: string, version: string, fileName: string): string {
    const key = `${workflowId}/${deliverableId}/${version}/${randomUUID()}-${fileName}`;
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async upload(
    storageKey: string,
    body: Buffer,
    metadata: Record<string, string> = {},
  ): Promise<string> {
    if (!this.client) {
      this.memory.set(storageKey, body);
      return storageKey;
    }
    const object: StoreObject = { metadata, body };
    await this.client.putObject(object, storageKey, this.bucketName);
    return storageKey;
  }

  /** 객체가 없으면 null. */
  async download(storageKey: string): Promise<Buffer | null> {
    if (!this.client) {
      return this.memory.get(storageKey) ?? null;
    }
    const object = await this.client.getObject(storageKey, this.bucketName);
    return object?.body ?? null;
  }

  async remove(storageKey: string): Promise<void> {
    if (!this.client) {
      this.memory.delete(storageKey);
      return;
    }
    await this.client.deleteObject(storageKey, this.bucketName);
  }

  async listKeys(prefix: string): Promise<string[]> {
    const full = this.prefix ? `${this.prefix}/${prefix}` : prefix;
    if (!this.client) {
      return [...this.memory.keys()].filter((k) => k.startsWith(full));
    }
    const keys: string[] = [];
    for await (const key of this.client.listObjectKeys(full, this.bucketName)) {
      keys.push(key);
    }
    return keys;
  }
}
