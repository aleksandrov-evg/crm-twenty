export type NormalizedContact = {
  phone: string | null;
  email: string | null;
  e164: string | null;
  nationalNumber: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/** Normalize phone to E.164 (+7…) and/or email to lowercase. */
export const normalizeContact = (
  phone: string | null | undefined,
  email: string | null | undefined,
): NormalizedContact => {
  const emailRaw = String(email ?? '').trim();
  const normalizedEmail =
    emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw.toLowerCase() : null;

  const phoneRaw = String(phone ?? '').trim();
  if (!phoneRaw) {
    return {
      phone: null,
      email: normalizedEmail,
      e164: null,
      nationalNumber: null,
    };
  }

  let digits = phoneRaw.replace(/\D/g, '');
  if (digits.startsWith('8') && digits.length === 11) {
    digits = `7${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    digits = `7${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    return {
      phone: `+${digits}`,
      email: normalizedEmail,
      e164: `+${digits}`,
      nationalNumber: digits.slice(1),
    };
  }

  return {
    phone: null,
    email: normalizedEmail,
    e164: null,
    nationalNumber: null,
  };
};

export const splitPersonName = (
  name: string | null | undefined,
): { firstName: string; lastName: string } => {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: 'Без имени', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

export const mapLeadSource = ({
  utmSource,
  utmMedium,
  utmCampaign,
}: {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
} = {}): string => {
  const source = String(utmSource ?? '')
    .trim()
    .toLowerCase();
  const medium = String(utmMedium ?? '')
    .trim()
    .toLowerCase();
  const campaign = String(utmCampaign ?? '')
    .trim()
    .toLowerCase();

  if (!source && !medium && !campaign) return 'UNKNOWN';

  if (
    source.includes('maps') ||
    medium.includes('maps') ||
    campaign.includes('maps') ||
    source === 'yandex_maps' ||
    source === '2gis'
  ) {
    return 'MAPS';
  }

  if (
    source.includes('yandex') ||
    source === 'ya' ||
    source === 'yd' ||
    source.includes('direct')
  ) {
    if (
      medium.includes('network') ||
      medium.includes('rsya') ||
      medium === 'display' ||
      medium === 'cpm' ||
      campaign.includes('rsya') ||
      campaign.includes('network')
    ) {
      return 'YANDEX_NETWORK';
    }
    return 'YANDEX_SEARCH';
  }

  if (
    medium === 'organic' ||
    source === 'organic' ||
    source === 'google' ||
    source === 'bing'
  ) {
    return 'ORGANIC_SEARCH';
  }

  if (
    source.includes('referr') ||
    medium === 'referral' ||
    source === 'friend' ||
    source === 'recommend'
  ) {
    return 'REFERRAL';
  }

  if (
    source.includes('telegram') ||
    source.includes('instagram') ||
    source.includes('vk') ||
    source.includes('social') ||
    medium === 'social' ||
    medium === 'cpc_social'
  ) {
    return 'SOCIAL';
  }

  if (
    source.includes('whatsapp') ||
    source.includes('dm') ||
    medium === 'dm' ||
    medium === 'message'
  ) {
    return 'DIRECT_MESSAGE';
  }

  if (source === 'walkin' || source === 'walk_in' || source === 'offline') {
    return 'WALK_IN';
  }

  return 'OTHER';
};

const INTEREST_TO_FORMAT: Record<string, string> = {
  reformer: 'INTRO_REFORMER',
  pilates: 'MAT_PILATES',
  stretching: 'STRETCHING',
  personal: 'PERSONAL_EQUIPMENT',
};

export const mapInterestedFormats = (
  interests: string[] | null | undefined,
): string[] => {
  if (!Array.isArray(interests)) return [];
  const formats = interests
    .map((value) => INTEREST_TO_FORMAT[String(value).trim().toLowerCase()])
    .filter((value): value is string => Boolean(value));
  return [...new Set(formats)];
};

export const opportunityName = (personName: string | null | undefined): string => {
  const label = String(personName ?? '').trim() || 'Клиент';
  return `${label} — первое занятие`;
};

export const toIsoDate = (value: string | Date | null | undefined): string => {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

export const slaDueAt = (from: Date = new Date()): string => {
  return new Date(from.getTime() + 2 * 60 * 60 * 1000).toISOString();
};

export const TASK_TITLE_CONTACT = 'Написать клиенту';
/** Старые заголовки задач — закрывать вместе с актуальными. */
export const TASK_TITLES_CONTACT_LEGACY = ['Связаться'] as const;
export const TASK_TITLES_FOLLOWUP_LEGACY = [
  'Перезвонить',
  'Связаться после no-show',
] as const;

export const TERMINAL_OPPORTUNITY_STAGES = new Set(['FIRST_PURCHASE', 'LOST']);
