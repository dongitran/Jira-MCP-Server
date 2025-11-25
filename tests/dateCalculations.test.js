import { describe, it, expect } from 'vitest';
import moment from 'moment';

/**
 * Tests for date calculation logic used in jiraTools
 * These are extracted helper functions for testing
 */

// Vietnamese holidays for 2025 (same as in jiraTools.js)
const vietnameseHolidays = [
  '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-03',
  '2025-04-18', '2025-04-30', '2025-05-01', '2025-09-01', '2025-09-02'
];

const isVietnameseHoliday = (date) => {
  return vietnameseHolidays.includes(moment(date).format('YYYY-MM-DD'));
};

const calculateWorkingDays = (start, end) => {
  if (!start || !end) return 1;
  let workingDays = 0;
  let current = moment(start);
  const endMoment = moment(end);
  
  while (current.isSameOrBefore(endMoment)) {
    if (current.day() >= 1 && current.day() <= 5 && !isVietnameseHoliday(current)) {
      workingDays++;
    }
    current.add(1, 'day');
  }
  return workingDays > 0 ? workingDays : 1;
};

const getWorkingDaysInCurrentMonth = (taskStartDate, taskEndDate, referenceDate = moment()) => {
  const monthStart = moment(referenceDate).startOf('month');
  const monthEnd = moment(referenceDate).endOf('month');

  const effectiveStart = taskStartDate ? moment.max(moment(taskStartDate), monthStart) : monthStart;
  const effectiveEnd = taskEndDate ? moment.min(moment(taskEndDate), monthEnd) : monthEnd;

  return calculateWorkingDays(effectiveStart, effectiveEnd);
};

describe('Date Calculations', () => {
  describe('isVietnameseHoliday', () => {
    it('should return true for New Year', () => {
      expect(isVietnameseHoliday('2025-01-01')).toBe(true);
    });

    it('should return true for Tet holidays', () => {
      expect(isVietnameseHoliday('2025-01-28')).toBe(true);
      expect(isVietnameseHoliday('2025-01-29')).toBe(true);
      expect(isVietnameseHoliday('2025-01-30')).toBe(true);
      expect(isVietnameseHoliday('2025-01-31')).toBe(true);
      expect(isVietnameseHoliday('2025-02-03')).toBe(true);
    });


    it('should return true for Reunification Day and Labor Day', () => {
      expect(isVietnameseHoliday('2025-04-30')).toBe(true);
      expect(isVietnameseHoliday('2025-05-01')).toBe(true);
    });

    it('should return true for National Day', () => {
      expect(isVietnameseHoliday('2025-09-01')).toBe(true);
      expect(isVietnameseHoliday('2025-09-02')).toBe(true);
    });

    it('should return false for regular days', () => {
      expect(isVietnameseHoliday('2025-01-02')).toBe(false);
      expect(isVietnameseHoliday('2025-03-15')).toBe(false);
      expect(isVietnameseHoliday('2025-06-20')).toBe(false);
    });
  });

  describe('calculateWorkingDays', () => {
    it('should return 1 for same day', () => {
      expect(calculateWorkingDays('2025-01-06', '2025-01-06')).toBe(1); // Monday
    });

    it('should count weekdays only', () => {
      // Monday to Friday = 5 working days
      expect(calculateWorkingDays('2025-01-06', '2025-01-10')).toBe(5);
    });

    it('should exclude weekends', () => {
      // Monday to Sunday (7 days) = 5 working days
      expect(calculateWorkingDays('2025-01-06', '2025-01-12')).toBe(5);
    });

    it('should exclude Vietnamese holidays', () => {
      // Jan 1 is a holiday, so Dec 30 to Jan 3 should have fewer working days
      // Dec 30 (Mon), Dec 31 (Tue), Jan 1 (Wed - holiday), Jan 2 (Thu), Jan 3 (Fri)
      expect(calculateWorkingDays('2024-12-30', '2025-01-03')).toBe(4);
    });

    it('should handle Tet holidays', () => {
      // Jan 27 (Mon) to Feb 3 (Mon) - Tet is Jan 28-31, Feb 3
      // Working days: Jan 27 (Mon), Feb 4 (Tue) if we extend
      // Jan 27 to Feb 3: Jan 27 (Mon), Feb 3 is holiday
      // So only Jan 27 is working day
      expect(calculateWorkingDays('2025-01-27', '2025-02-03')).toBe(1);
    });

    it('should return 1 for null start date', () => {
      expect(calculateWorkingDays(null, '2025-01-10')).toBe(1);
    });

    it('should return 1 for null end date', () => {
      expect(calculateWorkingDays('2025-01-06', null)).toBe(1);
    });

    it('should handle two week period', () => {
      // Jan 6 (Mon) to Jan 17 (Fri) = 10 working days
      expect(calculateWorkingDays('2025-01-06', '2025-01-17')).toBe(10);
    });

    it('should handle month spanning period', () => {
      // Jan 27 to Feb 7 - includes Tet holidays
      // Jan 27 (Mon) = 1
      // Jan 28-31 = holidays
      // Feb 3 = holiday
      // Feb 4 (Tue), Feb 5 (Wed), Feb 6 (Thu), Feb 7 (Fri) = 4
      // Total = 5
      expect(calculateWorkingDays('2025-01-27', '2025-02-07')).toBe(5);
    });
  });

  describe('getWorkingDaysInCurrentMonth', () => {
    it('should calculate working days for task within month', () => {
      // Task from Jan 6 to Jan 10 in January
      const result = getWorkingDaysInCurrentMonth(
        '2025-01-06',
        '2025-01-10',
        moment('2025-01-15')
      );
      expect(result).toBe(5);
    });

    it('should clip task start to month start', () => {
      // Task started in December but we want January portion
      const result = getWorkingDaysInCurrentMonth(
        '2024-12-15',
        '2025-01-10',
        moment('2025-01-15')
      );
      // Jan 1 is holiday, Jan 2-3 (Thu-Fri), Jan 4-5 (weekend), Jan 6-10 (Mon-Fri)
      // Working days: Jan 2, 3, 6, 7, 8, 9, 10 = 7
      expect(result).toBe(7);
    });

    it('should clip task end to month end', () => {
      // Task ends in February but we want January portion
      const result = getWorkingDaysInCurrentMonth(
        '2025-01-20',
        '2025-02-15',
        moment('2025-01-25')
      );
      // Jan 20 (Mon) to Jan 31 (Fri)
      // Jan 20-24 (Mon-Fri) = 5
      // Jan 25-26 (weekend) = 0
      // Jan 27 (Mon) = 1
      // Jan 28-31 = Tet holidays = 0
      // Total = 6
      expect(result).toBe(6);
    });

    it('should handle task spanning entire month', () => {
      // Task from Dec to Feb, calculate January portion
      const result = getWorkingDaysInCurrentMonth(
        '2024-12-01',
        '2025-02-28',
        moment('2025-01-15')
      );
      // All working days in January 2025
      // Jan 1 (holiday), Jan 2-3 (Thu-Fri), Jan 4-5 (weekend)
      // Jan 6-10 (Mon-Fri), Jan 11-12 (weekend)
      // Jan 13-17 (Mon-Fri), Jan 18-19 (weekend)
      // Jan 20-24 (Mon-Fri), Jan 25-26 (weekend)
      // Jan 27 (Mon), Jan 28-31 (Tet holidays)
      // Working days: 2, 3, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24, 27 = 18
      expect(result).toBe(18);
    });

    it('should return minimum 1 for task outside current month', () => {
      // Task in March, checking January
      const result = getWorkingDaysInCurrentMonth(
        '2025-03-01',
        '2025-03-15',
        moment('2025-01-15')
      );
      // Task starts after month end, but calculateWorkingDays returns minimum 1
      // This is the expected behavior from the original code
      expect(result).toBe(1);
    });
  });

  describe('Daily Hours Calculation', () => {
    it('should calculate daily hours correctly', () => {
      const storyPoints = 5;
      const totalHours = storyPoints * 2; // 10 hours
      const workingDays = calculateWorkingDays('2025-01-06', '2025-01-10'); // 5 days
      const dailyHours = totalHours / workingDays;
      
      expect(dailyHours).toBe(2);
    });

    it('should handle single day task', () => {
      const storyPoints = 4;
      const totalHours = storyPoints * 2; // 8 hours
      const workingDays = calculateWorkingDays('2025-01-06', '2025-01-06'); // 1 day
      const dailyHours = totalHours / workingDays;
      
      expect(dailyHours).toBe(8);
    });

    it('should handle long task with low story points', () => {
      const storyPoints = 2;
      const totalHours = storyPoints * 2; // 4 hours
      const workingDays = calculateWorkingDays('2025-01-06', '2025-01-17'); // 10 days
      const dailyHours = totalHours / workingDays;
      
      expect(dailyHours).toBe(0.4);
    });
  });

  describe('Monthly Hours Calculation', () => {
    it('should calculate monthly hours for task within month', () => {
      const storyPoints = 10;
      const totalHours = storyPoints * 2; // 20 hours
      const totalWorkingDays = calculateWorkingDays('2025-01-06', '2025-01-17'); // 10 days
      const currentMonthWorkingDays = getWorkingDaysInCurrentMonth(
        '2025-01-06',
        '2025-01-17',
        moment('2025-01-15')
      ); // 10 days
      
      const monthlyHours = (totalHours / totalWorkingDays) * currentMonthWorkingDays;
      
      expect(monthlyHours).toBe(20);
    });

    it('should calculate partial monthly hours for cross-month task', () => {
      const storyPoints = 10;
      const totalHours = storyPoints * 2; // 20 hours
      const totalWorkingDays = calculateWorkingDays('2025-01-20', '2025-02-07'); // ~13 days
      const currentMonthWorkingDays = getWorkingDaysInCurrentMonth(
        '2025-01-20',
        '2025-02-07',
        moment('2025-01-25')
      ); // ~6 days in January
      
      const monthlyHours = (totalHours / totalWorkingDays) * currentMonthWorkingDays;
      
      // Should be less than total hours since task spans two months
      expect(monthlyHours).toBeLessThan(20);
      expect(monthlyHours).toBeGreaterThan(0);
    });
  });
});
