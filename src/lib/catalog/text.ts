/** Normalize English catalog labels without changing non-English print names. */
export function catalogText(value: string, language: string = 'en'): string {
  if (language !== 'en') return value;
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}
