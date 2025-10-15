import Parse from 'parse';

export interface AirplaneInfo {
  /**
   * Locally assigned identifier used when persisting to browser storage.
   */
  id?: number;
  /**
   * Parse object id backing the record when retrieved from the backend.
   */
  objectId?: string;
  airplanenumber: string;
  model: string;
  airWorthDate: Date;
  statusCode: string;
}

export type SerializableAirplaneInfo = Omit<AirplaneInfo, 'airWorthDate'> & {
  airWorthDate: string;
};

export interface FAAMasterAttributes extends Parse.Attributes {
  nnumber: string;
  NAME: string;
  airWorthDate: string;
  statusCode: string;
}

export const airplaneInfoFromParseObject = (
  parseObject: Parse.Object<FAAMasterAttributes>
): AirplaneInfo => {
  const airWorthDateRaw = parseObject.get('airWorthDate');
  let airWorthDate: Date;

  if (airWorthDateRaw instanceof Date) {
    airWorthDate = airWorthDateRaw;
  } else if (typeof airWorthDateRaw === 'string') {
    const parsed = new Date(airWorthDateRaw);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Unable to parse air worth date from value: ${airWorthDateRaw}`);
    }
    airWorthDate = parsed;
  } else if (airWorthDateRaw) {
    airWorthDate = new Date(String(airWorthDateRaw));
  } else {
    // Default to Unix epoch when the value is missing to keep the contract intact.
    airWorthDate = new Date(0);
  }

  return {
    objectId: parseObject.id ?? undefined,
    airplanenumber: parseObject.get('nnumber') ?? '',
    model: parseObject.get('NAME') ?? '',
    airWorthDate,
    statusCode: parseObject.get('statusCode') ?? '',
  };
};

export const serializeAirplaneInfo = (
  airplaneInfo: AirplaneInfo
): SerializableAirplaneInfo => ({
  ...airplaneInfo,
  airWorthDate: airplaneInfo.airWorthDate.toISOString(),
});

export const deserializeAirplaneInfo = (
  serialized: SerializableAirplaneInfo
): AirplaneInfo => {
  const parsedAirWorthDate = new Date(serialized.airWorthDate);

  if (Number.isNaN(parsedAirWorthDate.getTime())) {
    throw new Error(`Invalid cached air worth date: ${serialized.airWorthDate}`);
  }

  return {
    ...serialized,
    airWorthDate: parsedAirWorthDate,
  };
};
