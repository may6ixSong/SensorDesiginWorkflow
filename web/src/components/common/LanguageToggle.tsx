import { useLanguage } from '@/i18n/LanguageContext';
import { HeaderIconButton } from './HeaderIconButton';

/** Language switch — sits left of the theme toggle in the top bar. */
export function LanguageToggle() {
  const { lang, toggle } = useLanguage();
  return (
    <HeaderIconButton
      icon="globe"
      label={lang === 'en' ? 'Language: English — switch to 한국어' : '언어: 한국어 — switch to English'}
      onClick={toggle}
    />
  );
}
