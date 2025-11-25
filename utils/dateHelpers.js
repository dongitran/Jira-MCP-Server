import moment from 'moment';

// Vietnamese holidays for 2025
// TODO: Consider making this configurable or fetching from external source
const VIETNAMESE_HOLIDAYS_2025 = [
  '2025-01-01', // New Year
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-03', // Tet
  '2025-04-18', // Hung Kings
  '2025-04-30', // Reunification Day
  '2025-05-01', // Labor Day
  '2025-09-01', '2025-09-02' // National Day
];

/**
 * Check if a date is a Vietnamese holiday
 * @param {string|moment.Moment} date - Date to check
 * @returns {boolean}
 */
export function isVietnameseHoliday(date) {
  return VIETNAMESE_HOLIDAYS_2025.includes(moment(date).format('YYYY-MM-DD'));
}

/**
 * Check if a date is a working day (Mon-Fri, not a holiday)
 * @param {moment.Moment} date - Date to check
 * @returns {boolean}
 */
export function isWorkingDay(date) {
  const day = date.day();
  return day >= 1 && day <= 5 && !isVietnameseHoliday(date);
}

/**
 * Calculate working days between two dates (inclusive)
 * @param {string|moment.Moment} startDate - Start date
 * @param {string|moment.Moment} endDate - End date
 * @returns {number} Number of working days
 */
export function getWorkingDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  
  let workingDays = 0;
  let current = moment(startDate);
  const endMoment = moment(endDate);

  while (current.isSameOrBefore(endMoment)) {
    if (isWorkingDay(current)) {
      workingDays++;
    }
    current.add(1, 'day');
  }
  return workingDays;
}

/**
 * Calculate working days in current month for a task
 * @param {string|moment.Moment} taskStartDate - Task start date
 * @param {string|moment.Moment} taskEndDate - Task end date
 * @returns {number} Working days in current month
 */
export function getWorkingDaysInCurrentMonth(taskStartDate, taskEndDate) {
  const monthStart = moment().startOf('month');
  const monthEnd = moment().endOf('month');

  const effectiveStart = taskStartDate 
    ? moment.max(moment(taskStartDate), monthStart) 
    : monthStart;
  const effectiveEnd = taskEndDate 
    ? moment.min(moment(taskEndDate), monthEnd) 
    : monthEnd;

  return getWorkingDaysBetween(effectiveStart, effectiveEnd);
}

/**
 * Calculate monthly hours for a task based on story points
 * @param {number} storyPoints - Story points
 * @param {string} taskStartDate - Task start date
 * @param {string} taskEndDate - Task end date (defaults to today)
 * @returns {object} Calculation result with monthlyHours and details
 */
export function calculateMonthlyHours(storyPoints, taskStartDate, taskEndDate) {
  if (!storyPoints || storyPoints <= 0) {
    return {
      monthlyHours: 0,
      totalHours: 0,
      totalWorkingDays: 0,
      currentMonthWorkingDays: 0,
      calculation: 'No story points assigned'
    };
  }

  const endDate = taskEndDate || moment().format('YYYY-MM-DD');
  const totalHours = storyPoints * 2;
  const totalWorkingDays = getWorkingDaysBetween(taskStartDate, endDate);
  const currentMonthWorkingDays = getWorkingDaysInCurrentMonth(taskStartDate, endDate);
  const monthlyHours = totalWorkingDays > 0
    ? (totalHours / totalWorkingDays) * currentMonthWorkingDays
    : 0;

  return {
    monthlyHours: Math.round(monthlyHours * 100) / 100,
    totalHours,
    totalWorkingDays,
    currentMonthWorkingDays,
    calculation: `(${storyPoints} SP × 2) / ${totalWorkingDays} days × ${currentMonthWorkingDays} current month = ${Math.round(monthlyHours * 100) / 100}h`
  };
}

/**
 * Check if task spans multiple months
 * @param {string} startDate - Start date
 * @param {string} endDate - End date (defaults to today)
 * @returns {boolean}
 */
export function spansMultipleMonths(startDate, endDate) {
  if (!endDate) endDate = moment().format('YYYY-MM-DD');
  const start = moment(startDate).startOf('month');
  const end = moment(endDate).startOf('month');
  return !start.isSame(end, 'month');
}

/**
 * Get current month info
 * @returns {object} Month info with startDate, endDate, monthName
 */
export function getCurrentMonthInfo() {
  return {
    startDate: moment().startOf('month').format('YYYY-MM-DD'),
    endDate: moment().endOf('month').format('YYYY-MM-DD'),
    monthName: moment().format('MMMM YYYY')
  };
}

/**
 * Round number to 2 decimal places
 * @param {number} num - Number to round
 * @returns {number}
 */
export function round2(num) {
  return Math.round(num * 100) / 100;
}
