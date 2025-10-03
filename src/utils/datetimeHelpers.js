import { format } from 'date-fns';

// DEBUG a toggle is now permanently off to prevent console spam.
const __DC_DEBUG_DATETIME = false; // Changed back to false

const dlog = (...args) => { if (__DC_DEBUG_DATETIME) console.log(...args); };
const derr = (...args) => { if (__DC_DEBUG_DATETIME) console.error(...args); };

/**
 * Converts a UTC ISO string (from DB) to a Date object whose local components
 * reflect the time in the user's specified timezone, without relying on date-fns-tz.
 *
 * Implementation detail:
 * - We get the target timezone's wall-clock parts via Intl for the given UTC instant
 * - Then construct a new Date(year, month-1, day, hh, mm, ss) in the browser's local zone,
 *   so Date#getFullYear()/getMonth()/getDate() match the intended user timezone components.
 *
 * @param {string} utcIsoString - The UTC ISO 8601 string from the database (e.g., "2025-10-25T10:00:00Z").
 * @param {string} userTimezone - The IANA timezone string of the user (e.g., "Asia/Colombo").
 * @returns {Date|null} A Date whose local components mirror the user timezone's local time for that instant.
 */
export const toUserTimezone = (utcIsoString, userTimezone) => {
  if (!utcIsoString || !userTimezone) {
    dlog(`datetimeHelpers DEBUG: toUserTimezone: Invalid utcIsoString or userTimezone. utcIsoString: '${utcIsoString}', userTimezone: '${userTimezone}'. Returning null.`);
    return null;
  }
  try {
    const utcDate = new Date(utcIsoString);
    if (isNaN(utcDate.getTime())) {
      dlog(`datetimeHelpers DEBUG: toUserTimezone: Invalid Date parsed from '${utcIsoString}'. Returning null.`);
      return null;
    }
    const p = formatInTZParts(utcDate, userTimezone);
    // Construct a "local" Date using the target timezone's wall time parts
    const localLike = new Date(p.year, (p.month || 1) - 1, p.day || 1, p.hour || 0, p.minute || 0, p.second || 0, 0);
    dlog(`datetimeHelpers DEBUG: toUserTimezone: utcIsoString: '${utcIsoString}', userTimezone: '${userTimezone}'. Parts:`, p, 'LocalLike:', localLike);
    return localLike;
  } catch (e) {
    derr(`datetimeHelpers ERROR: toUserTimezone (${userTimezone}) for '${utcIsoString}':`, e);
    return null;
  }
};

/**
 * Internal: Given a UTC Date, format it as parts in a target timeZone.
 * Returns { year, month, day, hour, minute, second } as numbers.
 */
function formatInTZParts(utcDate, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = dtf.formatToParts(utcDate);
  const get = (type) => parts.find(p => p.type === type)?.value;

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

/**
 * Internal: Convert "local wall time" in a given IANA timeZone to a UTC Date.
 * Algorithm adapted using Intl to compute the offset.
 *
 * @param {number} y
 * @param {number} m 1-12
 * @param {number} d 1-31
 * @param {number} hh 0-23
 * @param {number} mm 0-59
 * @param {string} timeZone
 * @returns {Date} UTC Date corresponding to that wall time in timeZone
 */
function zonedWallTimeToUTC(y, m, d, hh, mm, timeZone) {
  // First guess: interpret provided wall-time as if it were already UTC
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));

  // What does that guess look like in the target timezone?
  const tzAsParts = formatInTZParts(utcGuess, timeZone);
  // Reconstruct a UTC date from the timezone-formatted parts
  const tzAsUTC = new Date(Date.UTC(
    tzAsParts.year,
    tzAsParts.month - 1,
    tzAsParts.day,
    tzAsParts.hour,
    tzAsParts.minute,
    tzAsParts.second || 0,
    0
  ));

  // The difference between tzAsUTC and the guess is the timezone offset for that wall time
  const offsetMs = tzAsUTC.getTime() - utcGuess.getTime();

  // Apply the offset to the guess to get the correct UTC instant
  return new Date(utcGuess.getTime() - offsetMs);
}

/**
 * Takes user-entered local date/time strings and their timezone, and returns a UTC ISO string
 * suitable for database storage (TIMESTAMP WITH TIME ZONE).
 *
 * @param {string} localDateString - The local date string (e.g., "2025-10-25").
 * @param {string} localTimeString - The local time string (e.g., "10:00").
 * @param {string} userTimezone - The IANA timezone string of the user (e.g., "Asia/Colombo").
 * @returns {string} A UTC ISO 8601 string (e.g., "2025-10-25T04:30:00Z").
 */
export const fromUserTimezone = (localDateString, localTimeString, userTimezone) => {
  console.log(`[DEBUG fromUserTimezone] Input: date='${localDateString}', time='${localTimeString}', tz='${userTimezone}'`);
  if (!localDateString || !userTimezone) {
    console.log(`[DEBUG fromUserTimezone] Early exit: Invalid localDateString or userTimezone. Returning null.`);
    return null;
  }
  try {
    // Parse components
    const mDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDateString);
    if (!mDate) {
      console.error(`[DEBUG fromUserTimezone] ERROR: Invalid date format. Expected YYYY-MM-DD, got '${localDateString}'`);
      return null;
    }
    const y = Number(mDate[1]);
    const m = Number(mDate[2]);
    const d = Number(mDate[3]);

    let hh = 0, mm = 0;
    if (localTimeString && localTimeString.trim()) {
      const mTime = /^(\d{2}):(\d{2})$/.exec(localTimeString);
      if (!mTime) {
        console.error(`[DEBUG fromUserTimezone] ERROR: Invalid time format. Expected HH:MM (24h), got '${localTimeString}'`);
        return null;
      }
      hh = Number(mTime[1]);
      mm = Number(mTime[2]);
    }

    // Compute UTC Date corresponding to this wall time in userTimezone
    const utcDate = zonedWallTimeToUTC(y, m, d, hh, mm, userTimezone);

    if (isNaN(utcDate.getTime())) {
      console.error(`[DEBUG fromUserTimezone] ERROR: Resulting UTC Date is invalid.`);
      return null;
    }

    const result = utcDate.toISOString();
    console.log(`[DEBUG fromUserTimezone] Success: UTC ISO='${result}' (from ${y}-${m}-${d} ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} in ${userTimezone})`);
    return result;
  } catch (e) {
    console.error(`[DEBUG fromUserTimezone] ERROR: converting local to UTC for '${localDateString} ${localTimeString}' in '${userTimezone}':`, e?.message || e);
    return null;
  }
};

/**
 * Formats a Date object (which is already adjusted to the user's timezone by toUserTimezone)
 * for display in a human-readable format.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.
 * @param {string} formatStr - The format string (e.g., "MMM dd, yyyy", "HH:mm").
 * @returns {string} The formatted date/time string.
 */
export const formatInUserTimezone = (dateObj, formatStr) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: formatInUserTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning ''.`);
    return '';
  }
  try {
    const result = format(dateObj, formatStr);
    dlog(`datetimeHelpers DEBUG: formatInUserTimezone: dateObj: ${dateObj}, formatStr: '${formatStr}'. Result: ${result}`);
    return result;
  } catch (e) {
    derr(`datetimeHelpers ERROR: formatting date in user timezone for ${dateObj}:`, e);
    return '';
  }
};

/**
 * Formats a Date object (which is already adjusted to the user's timezone by toUserTimezone)
 * for display in a human-readable format, including timezone abbreviation.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.
 * @param {string} userTimezone - The IANA timezone string of the user (e.g., "Asia/Colombo").
 * @returns {string} The formatted date/time string with timezone (e.g., "Oct 25, 2025, 10:00 AM (SLT)").
 */
export const formatEventDisplayWithTimezone = (dateObj, userTimezone) => {
  if (!dateObj || isNaN(dateObj.getTime()) || !userTimezone) {
    dlog(`datetimeHelpers DEBUG: formatEventDisplayWithTimezone: Invalid dateObj or userTimezone. dateObj: ${dateObj}, userTimezone: ${userTimezone}. Returning 'N/A'.`);
    return 'N/A';
  }
  try {
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: userTimezone,
      timeZoneName: 'short', // e.g., "SLT"
    };
    const result = new Intl.DateTimeFormat('en-US', options).format(dateObj);
    dlog(`datetimeHelpers DEBUG: formatEventDisplayWithTimezone: dateObj: ${dateObj}, userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    derr(`datetimeHelpers ERROR: formatting event display with timezone for ${dateObj} in ${userTimezone}:`, e);
    return 'Invalid Date';
  }
};

/**
 * Formats a Date object (which is already adjusted to the user's timezone by toUserTimezone)
 * for display in a human-readable format, including full weekday and month.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.
 * @param {string} userTimezone - The IANA timezone string of the user (e.g., "Asia/Colombo").
 * @returns {string} The formatted date string (e.g., "Saturday, October 25, 2025").
 */
export const formatPrettyDateInUserTimezone = (dateObj, userTimezone) => {
  if (!dateObj || isNaN(dateObj.getTime()) || !userTimezone) {
    dlog(`datetimeHelpers DEBUG: formatPrettyDateInUserTimezone: Invalid dateObj or userTimezone. dateObj: ${dateObj}, userTimezone: ${userTimezone}. Returning 'N/A'.`);
    return 'N/A';
  }
  try {
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: userTimezone,
    };
    const result = new Intl.DateTimeFormat('en-US', options).format(dateObj);
    dlog(`datetimeHelpers DEBUG: formatPrettyDateInUserTimezone: dateObj: ${dateObj}, userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    derr(`datetimeHelpers ERROR: formatting pretty date in user timezone for ${dateObj} in ${userTimezone}:`, e);
    return 'Invalid Date';
  }
};

/**
 * Formats a Date object (which is already adjusted to the user's timezone by toUserTimezone)
 * for display as a time string.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.
 * @param {string} userTimezone - The IANA timezone string of the user (e.g., "Asia/Colombo").
 * @returns {string} The formatted time string (e.g., "10:00 AM").
 */
export const formatTimeInUserTimezone = (dateObj, userTimezone) => {
  if (!dateObj || isNaN(dateObj.getTime()) || !userTimezone) {
    dlog(`datetimeHelpers DEBUG: formatTimeInUserTimezone: Invalid dateObj or userTimezone. dateObj: ${dateObj}, userTimezone: ${userTimezone}. Returning ''.`);
    return '';
  }
  try {
    const options = {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: userTimezone,
      hour12: true,
    };
    const result = new Intl.DateTimeFormat('en-US', options).format(dateObj);
    dlog(`datetimeHelpers DEBUG: formatTimeInUserTimezone: dateObj: ${dateObj}, userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    derr(`datetimeHelpers ERROR: formatting time in user timezone for ${dateObj} in ${userTimezone}:`, e);
    return '';
  }
};

/**
 * Formats a Date object to 'YYYY-MM-DD' string in the specified timezone.
 * Useful for date input fields.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.
 * @param {string} userTimezone - The IANA timezone string of the user.
 * @returns {string} Date string in 'YYYY-MM-DD' format.
 */
export const formatToYYYYMMDDInUserTimezone = (dateObj, userTimezone) => {
  console.log(`[DEBUG formatToYYYYMMDD] Input: dateObj=${dateObj}, tz='${userTimezone}'`);
  if (!dateObj || isNaN(dateObj.getTime()) || !userTimezone) {
    console.log(`[DEBUG formatToYYYYMMDD] Early exit: Invalid dateObj or userTimezone. Returning ''.`);
    return '';
  }
  try {
    // Use Intl.DateTimeFormat to get year, month, day components in the target timezone
    const year = dateObj.toLocaleString('en-US', { year: 'numeric', timeZone: userTimezone });
    const month = dateObj.toLocaleString('en-US', { month: '2-digit', timeZone: userTimezone });
    const day = dateObj.toLocaleString('en-US', { day: '2-digit', timeZone: userTimezone });
    const result = `${year}-${month}-${day}`;
    console.log(`[DEBUG formatToYYYYMMDD] Success: Result='${result}'`);
    return result;
  } catch (e) {
    console.error(`[DEBUG formatToYYYYMMDD] ERROR: formatting to YYYY-MM-DD for ${dateObj} in ${userTimezone}:`, e);
    return '';
  }
};

/**
 * Formats a Date object to 'HH:MM' string in the specified timezone.
 * Useful for time input fields.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.
 * @param {string} userTimezone - The IANA timezone string of the user.
 * @returns {string} Time string in 'HH:MM' format.
 */
export const formatToHHMMInUserTimezone = (dateObj, userTimezone) => {
  console.log(`[DEBUG formatToHHMM] Input: dateObj=${dateObj}, tz='${userTimezone}'`);
  if (!dateObj || isNaN(dateObj.getTime()) || !userTimezone) {
    console.log(`[DEBUG formatToHHMM] Early exit: Invalid dateObj or userTimezone. Returning ''.`);
    return '';
  }
  try {
    const hour = dateObj.toLocaleString('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: userTimezone });
    const minute = dateObj.toLocaleString('en-US', { minute: '2-digit', timeZone: userTimezone });
    const result = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    console.log(`[DEBUG formatToHHMM] Success: Result='${result}'`);
    return result;
  } catch (e) {
    console.error(`[DEBUG formatToHHMM] ERROR: formatting to HH:MM for ${dateObj} in ${userTimezone}:`, e);
    return '';
  }
};

/**
 * Compares two Date objects (assumed to be in the same timezone context) to see if they represent the same day.
 * @param {Date} d1
 * @param {Date} d2
 * @returns {boolean} True if they are the same day, false otherwise.
 */
export const isSameDay = (d1, d2) => {
  if (!d1 || !d2 || isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    dlog(`datetimeHelpers DEBUG: isSameDay: Invalid date objects. d1: ${d1}, d2: ${d2}. Returning false.`);
    return false;
  }
  const result = d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
  dlog(`datetimeHelpers DEBUG: isSameDay: d1: ${d1}, d2: ${d2}. Result: ${result}`);
  return result;
};

/**
 * Gets the start of the day (00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the day.
 */
export const getStartOfDayInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getStartOfDayInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setHours(0, 0, 0, 0);
  dlog(`datetimeHelpers DEBUG: getStartOfDayInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the day (23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the day.
 */
export const getEndOfDayInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getEndOfDayInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setHours(23, 59, 59, 999);
  dlog(`datetimeHelpers DEBUG: getEndOfDayInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the start of the week (Sunday 00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the week.
 */
export const getStartOfWeekInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getStartOfWeekInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setDate(d.getDate() - d.getDay()); // Go to Sunday
  d.setHours(0, 0, 0, 0);
  dlog(`datetimeHelpers DEBUG: getStartOfWeekInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the week (Saturday 23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the week.
 */
export const getEndOfWeekInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getEndOfWeekInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setDate(d.getDate() - d.getDay() + 6); // Go to Saturday
  d.setHours(23, 59, 59, 999);
  dlog(`datetimeHelpers DEBUG: getEndOfWeekInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the start of the month (1st day 00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the month.
 */
export const getStartOfMonthInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getStartOfMonthInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  dlog(`datetimeHelpers DEBUG: getStartOfMonthInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the month (last day 23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the month.
 */
export const getEndOfMonthInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getEndOfMonthInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0); // Last day of previous month
  d.setHours(23, 59, 59, 999);
  dlog(`datetimeHelpers DEBUG: getEndOfMonthInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the start of the next month (1st day 00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the next month.
 */
export const getStartOfNextMonthInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getStartOfNextMonthInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  dlog(`datetimeHelpers DEBUG: getStartOfNextMonthInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the next month (last day 23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the next month.
 */
export const getEndOfNextMonthInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getEndOfNextMonthInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setMonth(d.getMonth() + 2);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  dlog(`datetimeHelpers DEBUG: getEndOfNextMonthInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the start of the year (Jan 1st 00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the year.
 */
export const getStartOfYearInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getStartOfYearInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setMonth(0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  dlog(`datetimeHelpers DEBUG: getStartOfYearInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the year (Dec 31st 23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the year.
 */
export const getEndOfYearInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getEndOfYearInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setMonth(11);
  d.setDate(31);
  d.setHours(23, 59, 59, 999);
  dlog(`datetimeHelpers DEBUG: getEndOfYearInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the start of the last year (Jan 1st 00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the last year.
 */
export const getStartOfLastYearInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getStartOfLastYearInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setFullYear(d.getFullYear() - 1);
  d.setMonth(0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  dlog(`datetimeHelpers DEBUG: getStartOfLastYearInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the last year (Dec 31st 23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the last year.
 */
export const getEndOfLastYearInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    dlog(`datetimeHelpers DEBUG: getEndOfLastYearInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setFullYear(d.getFullYear() - 1);
  d.setMonth(11);
  d.setDate(31);
  d.setHours(23, 59, 59, 999);
  dlog(`datetimeHelpers DEBUG: getEndOfLastYearInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};
