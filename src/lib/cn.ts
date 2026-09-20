/**
 * Minimal class joiner.
 *
 * Deliberately not `clsx` + `tailwind-merge`: the component set below never
 * relies on later classes overriding earlier ones, so the 6 kB of merge logic
 * would buy nothing on a phone.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
