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
      // Do NOT use 'navigator': the browser's UI language must not decide the
      // app language. Language comes from an explicit choice (querystring /
      // localStorage) or the fallbackLng ('en'); online, AuthProvider then
      // overrides it with the user's saved backend language.
      order: ['querystring', 'localStorage'],
      caches: ['localStorage'],
    },
  });

export default i18n;
