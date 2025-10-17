type NormalizedRecord = Record<string, string>;

export const normalizeRecord = (record: Record<string, string>): NormalizedRecord => {
  const normalized: NormalizedRecord = {};

  for (const [key, value] of Object.entries(record)) {
    if (!key) {
      continue;
    }

    const normalizedKey = key.trim().toUpperCase();
    const normalizedValue = typeof value === 'string' ? value.trim() : value;

    normalized[normalizedKey] = normalizedValue ?? '';
  }

  return normalized;
};

export const toNullableString = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
};

export const toNullableInt = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);

  return Number.isNaN(parsed) ? null : parsed;
};

export const toNullableBooleanFromYN = (value: string | undefined): boolean | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  if (normalized === 'Y') {
    return true;
  }

  if (normalized === 'N') {
    return false;
  }

  return null;
};

export const toNullableDateFromYYYYMMDD = (value: string | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const digits = value.replace(/[^0-9]/g, '');

  if (digits.length !== 8) {
    return null;
  }

  const year = Number.parseInt(digits.slice(0, 4), 10);
  const month = Number.parseInt(digits.slice(4, 6), 10);
  const day = Number.parseInt(digits.slice(6, 8), 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
};

export const normalizeTailNumber = (tailNumber: string | undefined): string => {
  if (!tailNumber) {
    return '';
  }

  return tailNumber.trim().toUpperCase();
};

export const buildOwnerExternalKey = (input: {
  name: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}): string => {
  const parts = [
    input.name,
    input.addressLine1,
    input.addressLine2,
    input.city,
    input.state,
    input.postalCode,
    input.country,
  ];

  return parts
    .map((part) => (part ? part.trim().toUpperCase() : ''))
    .join('|');
};
