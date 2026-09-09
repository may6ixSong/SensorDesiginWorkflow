import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HubSyncCheckpointDocument = HubSyncCheckpoint & Document;

/**
 * B 티어 동기화 커서 (Hub 설계서 §8.4).
 *
 * 읽기 방향(hpc_events → SIREN)은 이벤트 스트림이라 `updatedAt > lastCheckpoint`인
 * row만 가져온다. 쓰기 방향(SIREN → siren_common)은 전체 스냅샷 덮어쓰기라 커서가
 * 필요 없지만, 마지막 실행 시각·실패 사유를 같은 자리에 남긴다.
 *
 * 이 컬렉션은 SIREN 자체 Mongo에 있다 - 공용 DB가 아니므로 인프라 신청 대상이 아니다(§8.8).
 */
@Schema({ timestamps: true })
export class HubSyncCheckpoint {
  /** 공용 DB 쪽 테이블명 (placeholder: hpc_events / siren_common). */
  @Prop({ required: true, unique: true, trim: true, index: true })
  tableName: string;

  /** 읽기 방향에서만 쓴다 - 여기까지 읽었다는 표시. */
  @Prop({ type: Date, default: null })
  lastCheckpoint: Date | null;

  @Prop({ type: Date, default: null })
  lastRunAt: Date | null;

  /**
   * 마지막 실행이 실패했다면 그 사유. 이 채널은 요청-응답처럼 실패를 즉시 알 수
   * 없어서 조용히 오래 벌어질 수 있으므로, 반드시 남기고 알린다(§8.5).
   */
  @Prop({ type: String, default: null })
  lastError: string | null;

  _id: Types.ObjectId;
}

export const HubSyncCheckpointSchema = SchemaFactory.createForClass(HubSyncCheckpoint);
