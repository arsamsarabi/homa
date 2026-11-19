import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fa from './locales/fa.json';

export const languages = { en: { label: 'English', dir: 'ltr' }, fa: { label: 'فارسی', dir: 'rtl' } } as const;
export type Language = keyof typeof languages;

const STORAGE_KEY = 'homa-language';

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'fa') return saved;
  } catch {}
  return navigator.language.startsWith('fa') ? 'fa' : 'en';
}

/** Sets <html lang/dir> to match; Mantine reads the direction from there. */
function applyToDocument(lng: Language) {
  document.documentElement.lang = lng;
  document.documentElement.dir = languages[lng].dir;
}

export function setLanguage(lng: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {}
  void i18n.changeLanguage(lng);
  applyToDocument(lng);
}

const lng = initialLanguage();
applyToDocument(lng);
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fa: { translation: fa } },
  lng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
