import { DynamicModule, Provider } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import { createFakeModel } from './in-memory-driver';

export interface ModelDef {
  name: string;
  schema: MongooseSchema;
  /** populate() 대상 - { 필드경로: 참조 컬렉션명 } (인메모리 모드에서만 사용, 실제 DB에서는 schema의 ref로 동작). */
  populateRefs?: Record<string, string>;
}

/** MONGODB_URI가 설정되어 있을 때만 실제 DB에 연결한다 - 그 외에는 아무 것도 연결하지 않는다. */
export function isUsingRealDb(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

class InMemoryModelsModule {}

/**
 * MONGODB_URI가 있으면 실제 MongooseModule.forFeature로 등록한다.
 * 없으면 실제 DB에 전혀 연결하지 않고, `@InjectModel(X.name)`이 찾는 것과 동일한
 * DI 토큰(getModelToken)에 순수 인메모리 페이크 모델을 등록한다 - 서비스 코드는
 * 두 모드에서 완전히 동일하게 동작한다.
 */
export function registerModels(defs: ModelDef[]): DynamicModule {
  if (isUsingRealDb()) {
    return MongooseModule.forFeature(defs.map(({ name, schema }) => ({ name, schema })));
  }

  const providers: Provider[] = defs.map((d) => ({
    provide: getModelToken(d.name),
    useValue: createFakeModel(d.name, d.schema, d.populateRefs),
  }));

  return {
    module: InMemoryModelsModule,
    providers,
    exports: providers.map((p) => (p as { provide: string }).provide),
  };
}
