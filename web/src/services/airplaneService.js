import { normalizeNNumber } from '../utils/nNumber.js';

const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
const processEnv = typeof process !== 'undefined' ? process.env : undefined;
const API_BASE_URL =
  (env && env.VITE_API_BASE_URL) ||
  (processEnv && (processEnv.VITE_API_BASE_URL || processEnv.API_BASE_URL)) ||
  '/api';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

function parseAirWorthDate(value) {
  if (!value) {
    return {
      iso: null,
      display: ''
    };
  }

  if (value && typeof value === 'object') {
    const isoCandidate = value.iso || value.ISO || value.Iso;
    if (isoCandidate) {
      const dateFromIso = new Date(isoCandidate);
      if (!Number.isNaN(dateFromIso.getTime())) {
        return {
          iso: dateFromIso.toISOString(),
          display: value.display || dateFormatter.format(dateFromIso)
        };
      }
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      iso: null,
      display: ''
    };
  }

  return {
    iso: date.toISOString(),
    display: dateFormatter.format(date)
  };
}

function mapAirplane(dto) {
  const tailNumber = normalizeNNumber(dto?.airplanenumber || dto?.nnumber || dto?.tailNumber || '');
  const statusCode = (dto?.statusCode || dto?.status || '').trim().toUpperCase();
  const { iso, display } = parseAirWorthDate(dto?.airWorthDate || dto?.airworthDate || dto?.air_worth_date || dto?.airworthdate);

  return {
    id: dto?.id || dto?.objectId || tailNumber,
    tailNumber,
    model: dto?.model || dto?.NAME || dto?.name || '',
    statusCode,
    airWorthDate: iso,
    airWorthDateDisplay: display,
    raw: dto
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Search service returned invalid data.');
  }
}

function extractAirplanes(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.results)) {
    return payload.results;
  }

  if (Array.isArray(payload.airplanes)) {
    return payload.airplanes;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  return [];
}

export async function searchAirplanes(rawNNumber) {
  const normalized = normalizeNNumber(rawNNumber);
  if (!normalized) {
    return [];
  }

  const base = API_BASE_URL.replace(/\/$/, '');
  const url = `${base}/airplanes?tailNumber=${encodeURIComponent(normalized)}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Search failed with status ${response.status}.`);
  }

  const payload = await readJson(response);
  return extractAirplanes(payload)
    .map(mapAirplane)
    .filter((airplane) => airplane.tailNumber);
}

export async function getAirplaneDetails(rawNNumber) {
  const normalized = normalizeNNumber(rawNNumber);
  if (!normalized) {
    return null;
  }

  const airplanes = await searchAirplanes(normalized);
  return (
    airplanes.find((airplane) => airplane.tailNumber === normalized) || airplanes[0] || null
  );
}
