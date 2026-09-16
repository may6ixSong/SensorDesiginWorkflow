import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * 권한/수신 대상 한 벌 — 부서 다중 + 개별 사용자 다중 (설계서 01장 §3.1, §4.3).
 *
 * 이 모양이 시스템 전체에서 반복된다:
 *   - Workflow.editAccess / viewAccess (workflow 자체를 편집/열람할 수 있는가 — 이 둘은
 *     여전히 edit/view로 나뉜다. artifact/recipient와는 별개 축이다)
 *   - Block.recipients (A/B/C/D 공통 — 그 block의 artifact를 받을 대상. 실제 edit/view
 *     여부는 더 이상 여기서 갈리지 않는다 — A/B/C는 그 서비스가, D는 createdBy가 정한다)
 *
 * ★ 부서 단위 권한은 **조회 시점에 실시간으로** 판정한다 — 부여 시점의 멤버를 얼려두지
 *   않는다. 그래야 나중에 그 부서에 합류한 사람도 즉시 권한을 얻는다(설계서 01장 §3.2).
 *   그래서 여기에는 부서 id만 담고, 그 부서에 누가 속하는지는 담지 않는다.
 *
 * ★ users는 KnoxID 문자열만 담는다. 이름은 저장하지 않고 SDPCommonAPI로 조회한다
 *   (설계서 01장 §6). project member가 아닌 사람도 넣을 수 있다 — 실제로 열리는지는
 *   Project 계층이 최종 판정한다(설계서 01장 §2.2).
 */
@Schema({ _id: false })
export class AccessGrant {
  @Prop({ type: [String], default: [] })
  departments: string[];

  @Prop({ type: [String], default: [] })
  users: string[];
}

export const AccessGrantSchema = SchemaFactory.createForClass(AccessGrant);

/** 빈 권한/수신 대상 한 벌. 스키마 default로 쓴다. */
export const emptyAccessGrant = (): AccessGrant => ({ departments: [], users: [] });
