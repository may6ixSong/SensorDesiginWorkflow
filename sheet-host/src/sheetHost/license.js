import * as GC from '@mescius/spread-sheets';
// SDP_SPA에서는 이 import를 `../spreadSheet/licenseKey`로 바꾼다 — 키는 그 파일 한 곳에만 둔다.
import { SpreadJSKey } from '../dev/licenseKey';

// 모듈 최상위에서 워크북이 만들어지기 전에 한 번 설정한다(SDP_SPA spreadSheet.js:25와 같은 자리).
// 비어 있으면 평가판으로 돈다(로컬 개발).
if (SpreadJSKey) GC.Spread.Sheets.LicenseKey = SpreadJSKey;
