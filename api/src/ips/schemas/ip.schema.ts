import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * viewGrants[].department는 부여 시점에 명시적으로 지정하는 값이며
 * user.department와 다를 수 있다 (설계서 4.5) - 검증 없이 자유 입력.
 */
@Schema({ _id: false })
export class ViewGrant {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  department: string;

  @Prop({ default: () => new Date() })
  grantedAt: Date;
}
export const ViewGrantSchema = SchemaFactory.createForClass(ViewGrant);

export type IpDocument = Ip & Document;

@Schema({ timestamps: true })
export class Ip {
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  /** owners[0] = 대표 담당자. 모든 owner는 BE가 department==="analog" 검증 (설계서 3.3, 4.5). */
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  owners: Types.ObjectId[];

  @Prop({ type: [ViewGrantSchema], default: [] })
  viewGrants: ViewGrant[];

  @Prop({ default: '#0c9a83' })
  color: string;

  _id: Types.ObjectId;
}

export const IpSchema = SchemaFactory.createForClass(Ip);
