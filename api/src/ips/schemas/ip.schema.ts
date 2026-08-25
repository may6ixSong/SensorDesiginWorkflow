import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';
// @Prop의 런타임 type은 반드시 SchemaTypes.ObjectId를 쓴다 - Types.ObjectId(값 클래스)를 주면
// Mongoose가 Mixed 경로를 만들고, Mixed는 캐스팅을 하지 않아 문자열 id 필터가 전부 0건이 된다.
// (필드의 TypeScript 타입으로서의 Types.ObjectId는 그대로 쓴다.)

/**
 * 사용자는 KnoxID 문자열로만 참조한다 - api는 users 컬렉션을 갖지 않는다(src/common/actor.ts).
 * viewGrants[].department는 부여 시점에 명시적으로 지정하는 값이며 그 사용자의 실제
 * 소속과 다를 수 있다 (설계서 4.5) - 검증 없이 자유 입력.
 */
@Schema({ _id: false })
export class ViewGrant {
  @Prop({ required: true, trim: true })
  knoxId: string;

  @Prop({ required: true })
  department: string;

  @Prop({ default: () => new Date() })
  grantedAt: Date;
}
export const ViewGrantSchema = SchemaFactory.createForClass(ViewGrant);

export type IpDocument = Ip & Document;

@Schema({ timestamps: true })
export class Ip {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  /** IP가 속한 설계 도메인. 빈 문자열이면 FE가 UNASSIGNED로 묶는다 */
  @Prop({ default: '', trim: true, index: true })
  domain: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  /**
   * owners[0] = 대표 담당자. KnoxID 문자열 배열이다.
   * Edit 권한은 Analog 부서만 가질 수 있으나(설계서 3.3, 4.5), api는 사용자의 소속을
   * 조회할 수 없으므로 owner 추가 요청이 함께 보낸 department 값으로 검증한다.
   */
  @Prop({ type: [String], default: [] })
  owners: string[];

  @Prop({ type: [ViewGrantSchema], default: [] })
  viewGrants: ViewGrant[];

  @Prop({ default: '#0c9a83' })
  color: string;

  /**
   * 목업 시드가 만든 문서 표시 (MOCKUP_ENABLED). 사용자가 실제로 만든 데이터는 항상 false다.
   * MOCKUP_ENABLED=false 로 바꾸고 재시작하면 isMock:true 문서만 일괄 삭제된다
   * (src/database/seed-runner.service.ts) - 실제 데이터는 절대 건드리지 않는다.
   */
  @Prop({ default: false, index: true })
  isMock: boolean;

  _id: Types.ObjectId;
}

export const IpSchema = SchemaFactory.createForClass(Ip);
IpSchema.index({ owners: 1 });
IpSchema.index({ 'viewGrants.knoxId': 1 });
