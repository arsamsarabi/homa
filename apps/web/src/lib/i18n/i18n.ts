// i18next setup: English and Farsi, the saved choice or the browser's language, and <html lang dir>.
import i18n, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fa from './locales/fa.json';

export const languages = { en: { label: 'English', dir: 'ltr' }, fa: { label: 'فارسی', dir: 'rtl' } } as const;
export type Language = keyof typeof languages;

const STORAGE_KEY = 'homa-language';

function savedLanguage(): Language | undefined {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'fa') return saved;
  } catch {
    // Storage blocked (private mode): nothing saved.
  }
  return undefined;
}

// Until the instance's default arrives, the browser's language.
const initialLanguage = (): Language => savedLanguage() ?? (navigator.language.startsWith('fa') ? 'fa' : 'en');

/** Sets <html lang/dir> to match; Mantine reads the direction from there. */
function applyToDocument(lng: Language): void {
  document.documentElement.lang = lng;
  document.documentElement.dir = languages[lng].dir;
}

export function setLanguage(lng: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
  void i18n.changeLanguage(lng);
  applyToDocument(lng);
}

/** Uses the instance's default language, unless this browser has a saved choice. */
export function applyDefaultLanguage(lng: Language): void {
  if (savedLanguage() || i18n.language === lng) return;
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

export default i18n as I18n;

/** Keeps a left-to-right value (an email address) in one piece inside right-to-left text. */
export const isolate = (value: string): string => `⁨${value}⁩`;
