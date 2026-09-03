import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enCommon from './locales/en/common.json';
import koCommon from './locales/ko/common.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon },
      ko: { common: koCommon },
    },
    fallbackLng: 'en',
    ns: ['common'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      // SIREN web과 동일한 이유로 'navigator'는 쓰지 않는다 — 언어는 명시적 선택
      // (querystring/localStorage) 또는 fallbackLng를 따르고, AuthProvider가
      // 로그인 후 사용자의 저장된 언어로 덮어쓴다.
      order: ['querystring', 'localStorage'],
      caches: ['localStorage'],
    },
  });

export default i18n;
