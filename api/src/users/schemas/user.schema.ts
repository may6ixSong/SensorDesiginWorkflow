import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { DepartmentId } from '../../common/constants/departments';

export type UserDocument = User & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class User {
  @Prop({ required: true, unique: true, trim: true })
  empNo: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  email: string;

  @Prop({ type: String, required: true })
  department: DepartmentId;

  @Prop({ default: true })
  isActive: boolean;

  createdAt?: Date;
  _id: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
