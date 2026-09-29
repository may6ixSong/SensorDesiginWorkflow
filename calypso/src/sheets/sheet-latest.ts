import { ArtifactDocument, ArtifactSheetDraft } from '../artifacts/schemas/artifact.schema';

/**
 * sheet artifact의 latest(작업본, SIREN 설계서 11장 §4)에 대한 순수 계산 — 서비스와 화면 DTO가 같이 쓴다.
 *
 * sheetDraft가 없는 예전 sheet(저장할 때마다 minor 버전을 만들던 시절)는 최신 미발행 버전을 latest로
 * 본다. 한 번 저장하면 sheetDraft가 생긴다.
 */
export function draftOf(a: ArtifactDocument): ArtifactSheetDraft {
  if (a.sheetDraft) return a.sheetDraft;
  const latest = a.versions[0];
  return {
    files: latest && !latest.isReleased ? latest.files : [],
    updatedBy: latest?.createdBy ?? a.createdBy,
    updatedAt: latest?.createdAt ?? new Date(0),
    publishedVersionRef: latest?.isReleased ? latest.versionRef : null,
  } as ArtifactSheetDraft;
}

/** latest 표시 이름 — 마지막 published 버전 + "+". 아직 publish 전이면 "0+"(사용자 결정). */
export function sheetLatestLabel(a: ArtifactDocument): string {
  const published = a.versions.find((v) => v.isReleased);
  return published ? `${published.major}.${published.minor}+` : '0+';
}

/** 마지막 저장 이후 아직 publish하지 않은 내용이 있는가 — 저장한 적이 없으면 false. */
export function sheetHasUnpublished(a: ArtifactDocument): boolean {
  const d = draftOf(a);
  return (d.files ?? []).length > 0 && !d.publishedVersionRef;
}

export function sheetLatestInfo(a: ArtifactDocument) {
  const d = draftOf(a);
  return {
    label: sheetLatestLabel(a),
    saved: (d.files ?? []).length > 0,
    hasUnpublishedChanges: sheetHasUnpublished(a),
    updatedBy: d.updatedBy,
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
  };
}
