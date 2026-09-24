/** Comparison key only. Keep display names; preserve punctuation and semantic distinctions.
 * ASCII case folding is intentional: identical to the database regardless of locale.
 */
export function normalizeFoodName(value: string): string {
  return value.replace(/[A-Z]/g, letter => letter.toLowerCase()).replace(/[ \t\n\r\f\v]+/g, " ").replace(/^ | $/g, "");
}
