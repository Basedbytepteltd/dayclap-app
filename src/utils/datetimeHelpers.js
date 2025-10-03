import { format } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'; // Changed to direct named import

// DEBUG a toggle is now permanently off to prevent console spam.
const __DC_DEBUG_DATETIME = false; // Changed back to false

const dlog = (...args) => { if (__DC_DEBUG_DATETIME) console.log(...args); };
const derr = (...args) => { if (__DC_DEBUG_DATETIME) console.error(...args); };

/**
 * Converts a UTC ISO string (from DB) to a Date object representing that moment in the user's specified timezone.
 * This Date object will have its internal time adjusted so that its local time components (hours, minutes)
 * reflect the time in the target timezone.
 *
 * @param {string} utcIsoString - The UTC ISO 8601 string from the database (e.g., "2025-10-25T10:00:00Z").
 * @param {string} userTimezone - The IANA timezone string of the user (e.g., "Asia/Colombo").
 * @returns {Date} A Date object representing the UTC moment, but with its internal time adjusted to the user's timezone.
 */
export const toUserTimezone = (utcIsoString, userTimezone) => {
  if (!utcIsoString || !userTimezone) {
    dlog(`datetimeHelpers DEBUG: toUserTimezone: Invalid utcIsoString or userTimezone. utcIsoString: '${utcIsoString}', userTimezone: '${userTimezone}'. Returning null.`);
    return null;
  }
  try {
    const utcDate = new Date(utcIsoString);
    const result = utcToZonedTime(utcDate, userTimezone);
    dlog(`datetimeHelpers DEBUG: toUserTimezone: utcIsoString: '${utcIsoString}', userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    derr(`datetimeHelpers ERROR: converting UTC to user timezone (${userTimezone}) for '${utcIsoString}':`, e);
    return null;
  }
};

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
    // Combine date and time into a single string, assuming it's in the user's local timezone
    const localDateTimeString = `${localDateString}T${localTimeString || '00:00'}:00`;
    const zonedDate = zonedTimeToUtc(localDateTimeString, userTimezone);
    const result = zonedDate.toISOString();
    console.log(`[DEBUG fromUserTimezone] Success: localDateTimeString='${localDateTimeString}', UTC ISO='${result}'`);
    return result;
  } catch (e) {
    console.error(`[DEBUG fromUserTimezone] ERROR: converting local to UTC for '${localDateString} ${localTimeString}' in '${userTimezone}':`, e);
    return null;
  }
};

/**
 * Formats a Date object (which is already adjusted to the user's timezone by toUserTimezone)
 * for display in a human-readable format.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.\n * @param {string} formatStr - The format string (e.g., "MMM dd, yyyy", "HH:mm").
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
