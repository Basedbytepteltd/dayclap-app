import { format } from 'date-fns';
import * as dateFnsTz from 'date-fns-tz';

const utcToZonedTime = dateFnsTz.utcToZonedTime;
const zonedTimeToUtc = dateFnsTz.zonedTimeToUtc;

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
    console.log(`datetimeHelpers DEBUG: toUserTimezone: Invalid utcIsoString or userTimezone. utcIsoString: '${utcIsoString}', userTimezone: '${userTimezone}'. Returning null.`);
    return null;
  }
  try {
    const utcDate = new Date(utcIsoString);
    const result = utcToZonedTime(utcDate, userTimezone);
    console.log(`datetimeHelpers DEBUG: toUserTimezone: utcIsoString: '${utcIsoString}', userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    console.error(`datetimeHelpers ERROR: converting UTC to user timezone (${userTimezone}) for '${utcIsoString}':`, e);
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
  if (!localDateString || !userTimezone) {
    console.log(`datetimeHelpers DEBUG: fromUserTimezone: Invalid localDateString or userTimezone. localDateString: '${localDateString}', userTimezone: '${userTimezone}'. Returning null.`);
    return null;
  }
  try {
    // Combine date and time into a single string, assuming it's in the user's local timezone
    const localDateTimeString = `${localDateString}T${localTimeString || '00:00'}:00`;
    const zonedDate = zonedTimeToUtc(localDateTimeString, userTimezone);
    const result = zonedDate.toISOString();
    console.log(`datetimeHelpers DEBUG: fromUserTimezone: localDateString: '${localDateString}', localTimeString: '${localTimeString}', userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    console.error(`datetimeHelpers ERROR: converting local to UTC from user timezone (${userTimezone}) for '${localDateString} ${localTimeString}':`, e);
    return null;
  }
};

/**
 * Formats a Date object (which is already adjusted to the user's timezone by toUserTimezone)
 * for display in a human-readable format.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.\
 * @param {string} formatStr - The format string (e.g., "MMM dd, yyyy", "HH:mm").
 * @returns {string} The formatted date/time string.
 */
export const formatInUserTimezone = (dateObj, formatStr) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: formatInUserTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning ''.`);
    return '';
  }
  try {
    const result = format(dateObj, formatStr);
    console.log(`datetimeHelpers DEBUG: formatInUserTimezone: dateObj: ${dateObj}, formatStr: '${formatStr}'. Result: ${result}`);
    return result;
  } catch (e) {
    console.error(`datetimeHelpers ERROR: formatting date in user timezone for ${dateObj}:`, e);
    return '';
  }
};

/**
 * Formats a Date object (which is already adjusted to the user's timezone by toUserTimezone)
 * for display in a human-readable format, including timezone abbreviation.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.\
 * @param {string} userTimezone - The IANA timezone string of the user (e.g., "Asia/Colombo").
 * @returns {string} The formatted date/time string with timezone (e.g., "Oct 25, 2025, 10:00 AM (SLT)").
 */
export const formatEventDisplayWithTimezone = (dateObj, userTimezone) => {
  if (!dateObj || isNaN(dateObj.getTime()) || !userTimezone) {
    console.log(`datetimeHelpers DEBUG: formatEventDisplayWithTimezone: Invalid dateObj or userTimezone. dateObj: ${dateObj}, userTimezone: ${userTimezone}. Returning 'N/A'.`);
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
    console.log(`datetimeHelpers DEBUG: formatEventDisplayWithTimezone: dateObj: ${dateObj}, userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    console.error(`datetimeHelpers ERROR: formatting event display with timezone for ${dateObj} in ${userTimezone}:`, e);
    return 'Invalid Date';
  }
};

/**
 * Formats a Date object (which is already adjusted to the user's timezone by toUserTimezone)
 * for display in a human-readable format, including full weekday and month.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.\
 * @param {string} userTimezone - The IANA timezone string of the user (e.g., "Asia/Colombo").
 * @returns {string} The formatted date string (e.g., "Saturday, October 25, 2025").
 */
export const formatPrettyDateInUserTimezone = (dateObj, userTimezone) => {
  if (!dateObj || isNaN(dateObj.getTime()) || !userTimezone) {
    console.log(`datetimeHelpers DEBUG: formatPrettyDateInUserTimezone: Invalid dateObj or userTimezone. dateObj: ${dateObj}, userTimezone: ${userTimezone}. Returning 'N/A'.`);
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
    console.log(`datetimeHelpers DEBUG: formatPrettyDateInUserTimezone: dateObj: ${dateObj}, userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    console.error(`datetimeHelpers ERROR: formatting pretty date in user timezone for ${dateObj} in ${userTimezone}:`, e);
    return 'Invalid Date';
  }
};

/**
 * Formats a Date object (which is already adjusted to the user's timezone by toUserTimezone)
 * for display as a time string.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.\
 * @param {string} userTimezone - The IANA timezone string of the user (e.g., "Asia/Colombo").
 * @returns {string} The formatted time string (e.g., "10:00 AM").
 */
export const formatTimeInUserTimezone = (dateObj, userTimezone) => {
  if (!dateObj || isNaN(dateObj.getTime()) || !userTimezone) {
    console.log(`datetimeHelpers DEBUG: formatTimeInUserTimezone: Invalid dateObj or userTimezone. dateObj: ${dateObj}, userTimezone: ${userTimezone}. Returning ''.`);
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
    console.log(`datetimeHelpers DEBUG: formatTimeInUserTimezone: dateObj: ${dateObj}, userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    console.error(`datetimeHelpers ERROR: formatting time in user timezone for ${dateObj} in ${userTimezone}:`, e);
    return '';
  }
};

/**
 * Formats a Date object to 'YYYY-MM-DD' string in the specified timezone.
 * Useful for date input fields.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.\
 * @param {string} userTimezone - The IANA timezone string of the user.
 * @returns {string} Date string in 'YYYY-MM-DD' format.
 */
export const formatToYYYYMMDDInUserTimezone = (dateObj, userTimezone) => {
  if (!dateObj || isNaN(dateObj.getTime()) || !userTimezone) {
    console.log(`datetimeHelpers DEBUG: formatToYYYYMMDDInUserTimezone: Invalid dateObj or userTimezone. dateObj: ${dateObj}, userTimezone: ${userTimezone}. Returning ''.`);
    return '';
  }
  try {
    // Use Intl.DateTimeFormat to get year, month, day components in the target timezone
    const year = dateObj.toLocaleString('en-US', { year: 'numeric', timeZone: userTimezone });
    const month = dateObj.toLocaleString('en-US', { month: '2-digit', timeZone: userTimezone });
    const day = dateObj.toLocaleString('en-US', { day: '2-digit', timeZone: userTimezone });
    const result = `${year}-${month}-${day}`;
    console.log(`datetimeHelpers DEBUG: formatToYYYYMMDDInUserTimezone: dateObj: ${dateObj}, userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    console.error(`datetimeHelpers ERROR: formatting to YYYY-MM-DD in user timezone for ${dateObj} in ${userTimezone}:`, e);
    return '';
  }
};

/**
 * Formats a Date object to 'HH:MM' string in the specified timezone.
 * Useful for time input fields.
 *
 * @param {Date} dateObj - A Date object, typically one returned by `toUserTimezone`.\
 * @param {string} userTimezone - The IANA timezone string of the user.
 * @returns {string} Time string in 'HH:MM' format.
 */
export const formatToHHMMInUserTimezone = (dateObj, userTimezone) => {
  if (!dateObj || isNaN(dateObj.getTime()) || !userTimezone) {
    console.log(`datetimeHelpers DEBUG: formatToHHMMInUserTimezone: Invalid dateObj or userTimezone. dateObj: ${dateObj}, userTimezone: ${userTimezone}. Returning ''.`);
    return '';
  }
  try {
    const hour = dateObj.toLocaleString('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: userTimezone });
    const minute = dateObj.toLocaleString('en-US', { minute: '2-digit', timeZone: userTimezone });
    const result = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    console.log(`datetimeHelpers DEBUG: formatToHHMMInUserTimezone: dateObj: ${dateObj}, userTimezone: '${userTimezone}'. Result: ${result}`);
    return result;
  } catch (e) {
    console.error(`datetimeHelpers ERROR: formatting to HH:MM in user timezone for ${dateObj} in ${userTimezone}:`, e);
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
    console.log(`datetimeHelpers DEBUG: isSameDay: Invalid date objects. d1: ${d1}, d2: ${d2}. Returning false.`);
    return false;
  }
  const result = d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
  console.log(`datetimeHelpers DEBUG: isSameDay: d1: ${d1}, d2: ${d2}. Result: ${result}`);
  return result;
};

/**
 * Gets the start of the day (00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the day.
 */
export const getStartOfDayInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getStartOfDayInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setHours(0, 0, 0, 0);
  console.log(`datetimeHelpers DEBUG: getStartOfDayInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the day (23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the day.
 */
export const getEndOfDayInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getEndOfDayInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setHours(23, 59, 59, 999);
  console.log(`datetimeHelpers DEBUG: getEndOfDayInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the start of the week (Sunday 00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the week.
 */
export const getStartOfWeekInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getStartOfWeekInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setDate(d.getDate() - d.getDay()); // Go to Sunday
  d.setHours(0, 0, 0, 0);
  console.log(`datetimeHelpers DEBUG: getStartOfWeekInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the week (Saturday 23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the week.
 */
export const getEndOfWeekInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getEndOfWeekInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setDate(d.getDate() - d.getDay() + 6); // Go to Saturday
  d.setHours(23, 59, 59, 999);
  console.log(`datetimeHelpers DEBUG: getEndOfWeekInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the start of the month (1st day 00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the month.
 */
export const getStartOfMonthInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getStartOfMonthInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  console.log(`datetimeHelpers DEBUG: getStartOfMonthInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the month (last day 23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the month.
 */
export const getEndOfMonthInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getEndOfMonthInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0); // Last day of previous month
  d.setHours(23, 59, 59, 999);
  console.log(`datetimeHelpers DEBUG: getEndOfMonthInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the start of the next month (1st day 00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the next month.
 */
export const getStartOfNextMonthInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getStartOfNextMonthInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  console.log(`datetimeHelpers DEBUG: getStartOfNextMonthInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the next month (last day 23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the next month.
 */
export const getEndOfNextMonthInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getEndOfNextMonthInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setMonth(d.getMonth() + 2);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  console.log(`datetimeHelpers DEBUG: getEndOfNextMonthInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the start of the year (Jan 1st 00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the year.
 */
export const getStartOfYearInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getStartOfYearInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setMonth(0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  console.log(`datetimeHelpers DEBUG: getStartOfYearInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the year (Dec 31st 23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the year.
 */
export const getEndOfYearInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getEndOfYearInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setMonth(11);
  d.setDate(31);
  d.setHours(23, 59, 59, 999);
  console.log(`datetimeHelpers DEBUG: getEndOfYearInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the start of the last year (Jan 1st 00:00:00.000) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the start of the last year.
 */
export const getStartOfLastYearInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getStartOfLastYearInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setFullYear(d.getFullYear() - 1);
  d.setMonth(0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  console.log(`datetimeHelpers DEBUG: getStartOfLastYearInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};

/**
 * Gets the end of the last year (Dec 31st 23:59:59.999) for a given Date object, preserving its timezone context.
 * @param {Date} dateObj - The Date object.
 * @returns {Date} A new Date object representing the end of the last year.
 */
export const getEndOfLastYearInTimezone = (dateObj) => {
  if (!dateObj || isNaN(dateObj.getTime())) {
    console.log(`datetimeHelpers DEBUG: getEndOfLastYearInTimezone: Invalid dateObj. dateObj: ${dateObj}. Returning null.`);
    return null;
  }
  const d = new Date(dateObj);
  d.setFullYear(d.getFullYear() - 1);
  d.setMonth(11);
  d.setDate(31);
  d.setHours(23, 59, 59, 999);
  console.log(`datetimeHelpers DEBUG: getEndOfLastYearInTimezone: dateObj: ${dateObj}. Result: ${d}`);
  return d;
};
