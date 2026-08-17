/** Full name is stored in firstName; lastName is unused (kept for DB compat). */
export function formatDisplayName(firstName: string, lastName: string): string {
  const first = firstName.trim();
  if (first) return first;
  return lastName.trim();
}
