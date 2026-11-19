// Public-holiday feeds people can subscribe to in one click. Plain data so it's easy to edit: add an
// entry with a stable id (it's what the API takes), names in every UI language, and where the data
// comes from. Prefer official sources with an open license.
export type HolidayFeed = {
  /** Stable id, used by the API. Never reuse one for a different feed. */
  id: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  names: { en: string; fa: string };
  url: string;
  /** Who publishes the feed, and on what terms. */
  source: string;
};

export const HOLIDAY_CATALOG: readonly HolidayFeed[] = [
  {
    id: 'gb-eaw',
    country: 'GB',
    names: { en: 'UK bank holidays: England and Wales', fa: 'تعطیلات رسمی بریتانیا: انگلستان و ولز' },
    url: 'https://www.gov.uk/bank-holidays/england-and-wales.ics',
    source: 'GOV.UK, Open Government Licence v3.0',
  },
  {
    id: 'gb-sct',
    country: 'GB',
    names: { en: 'UK bank holidays: Scotland', fa: 'تعطیلات رسمی بریتانیا: اسکاتلند' },
    url: 'https://www.gov.uk/bank-holidays/scotland.ics',
    source: 'GOV.UK, Open Government Licence v3.0',
  },
  {
    id: 'gb-nir',
    country: 'GB',
    names: { en: 'UK bank holidays: Northern Ireland', fa: 'تعطیلات رسمی بریتانیا: ایرلند شمالی' },
    url: 'https://www.gov.uk/bank-holidays/northern-ireland.ics',
    source: 'GOV.UK, Open Government Licence v3.0',
  },
  {
    id: 'ir-en',
    country: 'IR',
    names: { en: 'Iran public holidays (English)', fa: 'تعطیلات رسمی ایران (انگلیسی)' },
    url: 'https://calendar.google.com/calendar/ical/en.ir%23holiday%40group.v.calendar.google.com/public/basic.ics',
    source: "Google Calendar's public holiday calendar, under Google's terms of service (no open license)",
  },
  {
    id: 'ir-fa',
    country: 'IR',
    names: { en: 'Iran public holidays (Persian)', fa: 'تعطیلات رسمی ایران (فارسی)' },
    url: 'https://calendar.google.com/calendar/ical/fa.ir%23holiday%40group.v.calendar.google.com/public/basic.ics',
    source: "Google Calendar's public holiday calendar, under Google's terms of service (no open license)",
  },
];

export const findHolidayFeed = (id: string): HolidayFeed | undefined => HOLIDAY_CATALOG.find((f) => f.id === id);
