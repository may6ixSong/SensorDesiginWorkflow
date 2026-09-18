/**
 * 순수 인메모리 Mongoose 호환 드라이버 - 실제 MongoDB에 전혀 연결하지 않는다
 * (네트워크 호출, 바이너리 다운로드 없음). "DB 연결 자체를 하지 말라"는 요구사항에 따라
 * mongodb-memory-server(실제 mongod 바이너리 다운로드 필요)도 쓰지 않는다.
 *
 * 이 프로젝트의 서비스 코드가 실제로 쓰는 Mongoose Model/Query 메서드만 구현한다:
 * find/findOne/findById/findByIdAndDelete/create/insertMany/updateOne($set)/
 * deleteMany/countDocuments/distinct, 그리고 쿼리 체이닝
 * .sort()/.skip()/.limit()/.populate()/.exec().
 * 필터 연산자는 $in/$nin/$ne/$exists/$gte/$gt/$lte/$lt/$elemMatch/$or/$and 까지 지원한다 -
 * My Assignment의 달 범위 조회와 페이지네이션이 이 위에서 돈다.
 * 문서 인스턴스에는 .save()/.deleteOne()을 붙여 실제 Mongoose 문서처럼 동작하게 한다.
 *
 * _id는 실제 mongoose.Types.ObjectId를 그대로 쓴다 - 이 클래스는 순수 값 객체라
 * DB 연결 없이도 동작하며, 나머지 코드 전반의 `.toString()` 비교 로직과 100% 호환된다.
 */
import { Schema, Types } from 'mongoose';

type AnyDoc = Record<string, any>;

/**
 * 실제 Mongoose Schema 정의(순수 값 객체, DB 연결 불필요)를 이용해 최상위 필드의
 * 기본값을 채운다. 서브다큐먼트 배열(versions, viewGrants 등)까지는 재귀하지 않는다 -
 * 이 프로젝트의 모든 서비스 코드는 그런 배열을 항상 완전히 채워서 넘기기 때문.
 */
function applyTopLevelDefaults(schema: Schema, input: AnyDoc): AnyDoc {
  const result: AnyDoc = { ...input };
  schema.eachPath((pathName, schemaType) => {
    if (pathName === '_id' || pathName.includes('.') || result[pathName] !== undefined) return;
    const st = schemaType as unknown as {
      getDefault: (scope?: unknown) => unknown;
      defaultValue: unknown;
    };
    let def: unknown;
    try {
      // getDefault()는 런타임에 존재하지만 공개 타입 선언에는 없다(mongoose 내부 API).
      def = st.getDefault(result);
    } catch {
      // 배열 타입 필드(예: [String] default: [])는 실제 문서(document) 컨텍스트 밖에서
      // getDefault()가 내부적으로 값을 캐스팅하려 하며 subdocument 스키마를 찾다가
      // 터진다(mongoose SchemaArray.cast). 여기서는 캐스팅이 필요 없는 리터럴
      // 기본값이면 충분하므로 원본 defaultValue를 그대로(함수면 호출해서) 쓴다.
      def = typeof st.defaultValue === 'function' ? (st.defaultValue as () => unknown)() : st.defaultValue;
    }
    if (def !== undefined) result[pathName] = def;
  });
  return result;
}

const registry = new Map<string, Map<string, AnyDoc>>();

function getCollection(name: string): Map<string, AnyDoc> {
  if (!registry.has(name)) registry.set(name, new Map());
  return registry.get(name)!;
}

/** 개발용 전체 초기화 (재시드 시 사용). */
export function resetAllCollections(): void {
  for (const store of registry.values()) store.clear();
}

function idish(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (v instanceof Types.ObjectId) return v.toString();
  return String(v);
}

/** 점(dot) 경로 탐색. 중간에 배열(서브다큐먼트 배열)을 만나면 각 원소의 나머지 경로 값을 모아 배열로 반환한다. */
function getByPath(doc: AnyDoc, path: string): any {
  const parts = path.split('.');
  let current: any = doc;
  for (const part of parts) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      return current.map((item) => item?.[part]);
    }
    current = current[part];
  }
  return current;
}

function setByPath(doc: AnyDoc, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = current[parts[i]] ?? {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * 비교 연산자가 받는 값 — Date/number/string 전부 정렬 가능한 원시값으로 낮춘다.
 * Date끼리, 숫자끼리 비교되게 하려는 것뿐이고 서로 다른 타입을 섞어 비교하지는 않는다.
 */
function comparable(v: unknown): number | string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    // 'YYYY-MM-DD...' 같은 날짜 문자열은 문자열 비교로도 순서가 맞는다 — 그대로 둔다.
    return v;
  }
  if (v instanceof Types.ObjectId) return v.toString();
  return null;
}

function compare(actual: unknown, bound: unknown, op: '$gte' | '$gt' | '$lte' | '$lt'): boolean {
  const a = comparable(actual);
  const b = comparable(bound);
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  switch (op) {
    case '$gte': return a >= b;
    case '$gt': return a > b;
    case '$lte': return a <= b;
    case '$lt': return a < b;
  }
}

const COMPARISON_OPS = ['$gte', '$gt', '$lte', '$lt'] as const;

/**
 * 연산자 객체 하나를 한 값에 대해 판정한다. 배열(멀티키) 처리는 호출부가 한다.
 *
 * ★ 실제 MongoDB의 멀티키 의미론을 그대로 흉내낸다 — 배열 필드에 `{$gte, $lt}`를 걸면
 *   "같은 원소 하나가 양쪽을 다 만족"이 아니라 "각 조건을 만족하는 원소가 배열 안에
 *   하나씩 있으면" 매치다. 그래서 달 범위 필터는 **과매치**될 수 있고, 호출부가
 *   엔트리 단위로 한 번 더 걸러야 한다(assignments 쪽이 그렇게 한다).
 */
function matchesOperators(actual: unknown, condition: Record<string, unknown>): boolean {
  const actualArr = Array.isArray(actual) ? actual : [actual];
  for (const [op, operand] of Object.entries(condition)) {
    switch (op) {
      case '$in': {
        const targets = (operand as unknown[]).map(idish);
        if (!actualArr.some((a) => targets.includes(idish(a)))) return false;
        break;
      }
      case '$nin': {
        const targets = (operand as unknown[]).map(idish);
        if (actualArr.some((a) => targets.includes(idish(a)))) return false;
        break;
      }
      case '$ne': {
        // 배열이면 "그 값을 가진 원소가 하나도 없어야" 한다(MongoDB와 같다).
        if (actualArr.some((a) => idish(a) === idish(operand))) return false;
        break;
      }
      case '$exists': {
        const present = actual !== undefined && actual !== null;
        if (present !== Boolean(operand)) return false;
        break;
      }
      case '$gte': case '$gt': case '$lte': case '$lt': {
        if (!actualArr.some((a) => compare(a, operand, op as (typeof COMPARISON_OPS)[number]))) return false;
        break;
      }
      case '$elemMatch': {
        // 원소 하나가 하위 조건 전부를 만족해야 한다 — 위 멀티키 과매치를 정확히 좁힐 때 쓴다.
        if (!Array.isArray(actual)) return false;
        if (!actual.some((el) => matches(el as AnyDoc, operand as AnyDoc))) return false;
        break;
      }
      default:
        // 모르는 연산자는 동등 비교로 떨어뜨리지 않고 "안 맞음"으로 둔다 — 조용히 전체를
        // 통과시키면 권한 필터가 무력화될 수 있어서, 실패를 관대하게 처리하지 않는다.
        return false;
    }
  }
  return true;
}

function isOperatorObject(condition: unknown): condition is Record<string, unknown> {
  return (
    !!condition &&
    typeof condition === 'object' &&
    !Array.isArray(condition) &&
    !(condition instanceof Types.ObjectId) &&
    !(condition instanceof Date) &&
    Object.keys(condition).some((k) => k.startsWith('$'))
  );
}

function matchesCondition(actual: unknown, condition: unknown): boolean {
  if (isOperatorObject(condition)) return matchesOperators(actual, condition);
  const target = idish(condition);
  if (Array.isArray(actual)) {
    return actual.some((a) => idish(a) === target);
  }
  return idish(actual) === target;
}

function matches(doc: AnyDoc, filter: AnyDoc | undefined): boolean {
  if (!filter) return true;
  for (const key of Object.keys(filter)) {
    if (key === '$or') {
      const clauses = filter.$or as AnyDoc[];
      if (!clauses.some((c) => matches(doc, c))) return false;
      continue;
    }
    if (key === '$and') {
      const clauses = filter.$and as AnyDoc[];
      if (!clauses.every((c) => matches(doc, c))) return false;
      continue;
    }
    const actual = getByPath(doc, key);
    if (!matchesCondition(actual, filter[key])) return false;
  }
  return true;
}

function applySort(docs: AnyDoc[], spec: Record<string, 1 | -1>): AnyDoc[] {
  const entries = Object.entries(spec);
  return [...docs].sort((a, b) => {
    for (const [key, dir] of entries) {
      let av = getByPath(a, key);
      let bv = getByPath(b, key);
      if (av instanceof Date) av = av.getTime();
      if (bv instanceof Date) bv = bv.getTime();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
    }
    return 0;
  });
}

function attachInstanceMethods(doc: AnyDoc, store: Map<string, AnyDoc>): AnyDoc {
  Object.defineProperty(doc, 'save', {
    value: async function save(this: AnyDoc) {
      store.set(idish(this._id), this);
      return this;
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(doc, 'deleteOne', {
    value: async function deleteOneSelf(this: AnyDoc) {
      store.delete(idish(this._id));
      return this;
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(doc, 'toObject', {
    value: function toObject(this: AnyDoc) {
      return { ...this };
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return doc;
}

type QueryKind =
  | 'find'
  | 'findOne'
  | 'findById'
  | 'findByIdAndDelete'
  | 'updateOne'
  | 'findOneAndUpdate'
  | 'deleteMany'
  | 'countDocuments';

class FakeQuery<T> implements PromiseLike<T> {
  private sortSpec: Record<string, 1 | -1> | null = null;
  private populatePaths: string[] = [];
  private skipCount = 0;
  private limitCount: number | null = null;

  constructor(
    private readonly store: Map<string, AnyDoc>,
    private readonly kind: QueryKind,
    private readonly filter: AnyDoc | null,
    private readonly extra: unknown,
    private readonly populateRefs: Record<string, string>,
  ) {}

  sort(spec: Record<string, 1 | -1>): this {
    this.sortSpec = spec;
    return this;
  }

  /** 페이지네이션 — My Assignment의 release 목록이 쓴다. sort 뒤에 적용된다. */
  skip(n: number): this {
    this.skipCount = n;
    return this;
  }

  limit(n: number): this {
    this.limitCount = n;
    return this;
  }

  populate(path: string): this {
    this.populatePaths.push(path);
    return this;
  }

  /**
   * 실제 Mongoose의 `.lean()`은 Document로 감싸지 않고 원본을 그대로 돌려준다는 뜻이라,
   * `_id:true` 서브다큐먼트 배열에 저장된 `_id` 없는 엔트리를 hydrate 시점에 위조로
   * 채우지 않는다(version-id-backfill.service.ts 참고). 이 가짜 드라이버는 애초에
   * 문서를 항상 순수 객체로만 다뤄서 그런 위조가 없으므로, 여기서는 그냥 아무것도 안
   * 하고 체이닝만 유지한다.
   */
  lean(): this {
    return this;
  }

  private resolveMatches(): AnyDoc[] {
    return Array.from(this.store.values()).filter((d) => matches(d, this.filter ?? undefined));
  }

  private populateOne(doc: AnyDoc | null): AnyDoc | null {
    if (!doc || !this.populatePaths.length) return doc;
    const clone: AnyDoc = { ...doc };
    for (const path of this.populatePaths) {
      const targetName = this.populateRefs[path];
      if (!targetName) continue;
      const targetStore = getCollection(targetName);
      if (path.includes('.')) {
        const [arrField, subField] = path.split('.');
        clone[arrField] = (doc[arrField] ?? []).map((item: AnyDoc) => ({
          ...item,
          [subField]: targetStore.get(idish(item[subField])) ?? item[subField],
        }));
      } else {
        const raw = doc[path];
        if (Array.isArray(raw)) {
          clone[path] = raw.map((id) => targetStore.get(idish(id))).filter(Boolean);
        } else if (raw) {
          clone[path] = targetStore.get(idish(raw)) ?? raw;
        }
      }
    }
    return clone;
  }

  async exec(): Promise<any> {
    switch (this.kind) {
      case 'find': {
        let docs = this.resolveMatches();
        if (this.sortSpec) docs = applySort(docs, this.sortSpec);
        // skip/limit은 정렬 뒤에 — 실제 Mongo와 같은 순서다.
        if (this.skipCount > 0) docs = docs.slice(this.skipCount);
        if (this.limitCount !== null) docs = docs.slice(0, this.limitCount);
        return docs.map((d) => this.populateOne(d));
      }
      case 'findOne': {
        const docs = this.resolveMatches();
        return this.populateOne(docs[0] ?? null);
      }
      case 'findById': {
        const doc = this.store.get(idish(this.extra)) ?? null;
        return this.populateOne(doc);
      }
      case 'findByIdAndDelete': {
        const key = idish(this.extra);
        const doc = this.store.get(key) ?? null;
        if (doc) this.store.delete(key);
        return doc;
      }
      case 'updateOne': {
        const doc = this.resolveMatches()[0];
        const update = this.extra as { $set?: AnyDoc } | undefined;
        if (doc && update?.$set) {
          for (const [k, v] of Object.entries(update.$set)) setByPath(doc, k, v);
        }
        return { acknowledged: true, matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
      }
      // 지금 이 저장소에서 실제로 쓰는 건 releases.service.ts의 원자적 seq 증가
      // (`$inc` + `{new:true}`) 하나뿐이다 - 그 용도만 지원한다.
      case 'findOneAndUpdate': {
        const doc = this.resolveMatches()[0] ?? null;
        const { update } = this.extra as { update?: { $set?: AnyDoc; $inc?: AnyDoc } };
        if (doc && update?.$set) {
          for (const [k, v] of Object.entries(update.$set)) setByPath(doc, k, v);
        }
        if (doc && update?.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            setByPath(doc, k, (getByPath(doc, k) ?? 0) + (v as number));
          }
        }
        return this.populateOne(doc);
      }
      case 'deleteMany': {
        const docs = this.resolveMatches();
        for (const d of docs) this.store.delete(idish(d._id));
        return { acknowledged: true, deletedCount: docs.length };
      }
      case 'countDocuments': {
        return this.resolveMatches().length;
      }
      default:
        return undefined;
    }
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled as any, onrejected as any);
  }
}

/**
 * 실제 Mongoose Model과 동일한 DI 토큰에 꽂히는 페이크 모델.
 * populateRefs: { 필드경로: 참조 컬렉션명 } - .populate() 호출 시 사용.
 */
export function createFakeModel<T = AnyDoc>(name: string, schema: Schema, populateRefs: Record<string, string> = {}): T {
  const store = getCollection(name);

  const build = (input: AnyDoc): AnyDoc => {
    const withDefaults = applyTopLevelDefaults(schema, input);
    const doc: AnyDoc = { _id: withDefaults._id ?? new Types.ObjectId(), ...withDefaults };
    attachInstanceMethods(doc, store);
    store.set(idish(doc._id), doc);
    return doc;
  };

  const api = {
    find: (filter?: AnyDoc) => new FakeQuery(store, 'find', filter ?? null, null, populateRefs),
    findOne: (filter?: AnyDoc) => new FakeQuery(store, 'findOne', filter ?? null, null, populateRefs),
    findById: (id: unknown) => new FakeQuery(store, 'findById', null, id, populateRefs),
    findByIdAndDelete: (id: unknown) => new FakeQuery(store, 'findByIdAndDelete', null, id, populateRefs),
    updateOne: (filter: AnyDoc, update: AnyDoc) => new FakeQuery(store, 'updateOne', filter, update, populateRefs),
    findOneAndUpdate: (filter: AnyDoc, update: AnyDoc, options?: AnyDoc) =>
      new FakeQuery(store, 'findOneAndUpdate', filter, { update, options }, populateRefs),
    deleteMany: (filter?: AnyDoc) => new FakeQuery(store, 'deleteMany', filter ?? null, null, populateRefs),
    countDocuments: (filter?: AnyDoc) => new FakeQuery(store, 'countDocuments', filter ?? null, null, populateRefs),
    distinct: async (field: string, filter?: AnyDoc) => {
      const docs = Array.from(store.values()).filter((d) => matches(d, filter));
      const seen = new Map<string, unknown>();
      for (const d of docs) {
        const v = getByPath(d, field);
        const values = Array.isArray(v) ? v : [v];
        for (const val of values) if (val !== undefined) seen.set(idish(val), val);
      }
      return Array.from(seen.values());
    },
    create: async (input: AnyDoc) => build(input),
    insertMany: async (inputs: AnyDoc[]) => inputs.map(build),
  };

  return api as unknown as T;
}
