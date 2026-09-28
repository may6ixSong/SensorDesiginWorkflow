import { BadRequestException, NotFoundException, StreamableFile } from '@nestjs/common';
import { ArtifactDocument, ArtifactVersion } from './schemas/artifact.schema';
import { StorageService } from '../storage/storage.service';

/**
 * 한 버전의 파일을 내려줄 몸체를 만든다 — 파일이 하나면 그대로, 여러 개면 zip 하나로
 * 묶는다(§3.9, 사용자 결정). 사람이 쓰는 다운로드(ArtifactsController)와 Auto Run source
 * 다운로드(AutoRunSourceController)가 같은 규칙을 쓰도록 여기 하나로 모았다. 권한 판정은
 * 호출부가 이미 끝내고 들어온다.
 */
export async function streamVersionFiles(
  storage: StorageService,
  a: ArtifactDocument,
  version: ArtifactVersion,
): Promise<StreamableFile> {
  const files = version.files ?? [];
  if (!files.length) throw new BadRequestException('This version has no stored file.');

  if (files.length === 1) {
    const body = await storage.download(files[0].storageKey);
    if (!body) throw new NotFoundException('The stored file could not be found.');
    return new StreamableFile(body, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${encodeURIComponent(files[0].fileName)}"`,
    });
  }

  const buffers = await Promise.all(files.map((f) => storage.download(f.storageKey)));
  // archiver@8은 ESM 전용이라 컴파일된 CJS 코드에서 정적 import(=require)로 못 읽는다.
  // 그냥 `await import('archiver')`를 쓰면 tsconfig의 module:commonjs 때문에 TypeScript가
  // 다시 require()로 downlevel 컴파일해버려 같은 에러가 난다 — new Function으로 만든
  // import() 호출은 TS가 문자열 안 코드를 못 건드리므로 런타임에 진짜 ESM dynamic
  // import로 남는다(archiver 같은 ESM-only 패키지를 CJS에서 쓸 때 널리 쓰는 우회법).
  const importArchiver = new Function('return import("archiver")') as () => Promise<typeof import('archiver')>;
  const { ZipArchive } = await importArchiver();
  const archive = new ZipArchive({ zlib: { level: 9 } });
  files.forEach((f, i) => {
    const buf = buffers[i];
    if (buf) archive.append(buf, { name: f.fileName });
  });
  void archive.finalize();
  return new StreamableFile(archive, {
    type: 'application/zip',
    disposition: `attachment; filename="${encodeURIComponent(a.name)}-${version.major}.${version.minor}.zip"`,
  });
}
