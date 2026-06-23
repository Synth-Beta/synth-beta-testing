/**
 * Calculates an age in years from a birth date.
 *
 * Logic: year difference minus one when the birthday hasn't occurred yet this year.
 * Also handles `YYYY-MM-DD` date-only strings in local time to avoid timezone off-by-one issues.
 */
export function calculateAge(
  birthDateInput: Date | string | null | undefined,
  todayInput: Date = new Date()
): number | null {
  if (!birthDateInput) return null;

  const today = todayInput instanceof Date ? todayInput : new Date(todayInput);
  if (Number.isNaN(today.getTime())) return null;

  const birthDate = parseBirthDate(birthDateInput);
  if (!birthDate) return null;

  let age = today.getFullYear() - birthDate.getFullYear();

  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  if (age < 0) return null;
  return age;
}

function parseBirthDate(input: Date | string): Date | null {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  const s = input.trim();

  // Date-only string from <input type="date"> or ISO date storage
  // Parse as local date to avoid timezone shifts.
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const monthIndex = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);

    const d = new Date(year, monthIndex, day);
    // Validate that the date components round-trip (catches invalid like 2024-02-31)
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== monthIndex ||
      d.getDate() !== day
    ) {
      return null;
    }
    return d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

