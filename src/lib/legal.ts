/**
 * Which sections each legal document is made of.
 *
 * Here rather than in the page so the tests can assert that every locale
 * actually has them. Google refused to verify the OAuth app because the
 * privacy policy "does not have sufficient content"; a silently dropped
 * section would bring that back, and nobody reads these pages in staging.
 */

export const LEGAL_DOCUMENTS = ['terms', 'privacy', 'legal-notice'] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_SECTIONS: Record<LegalDocument, readonly string[]> = {
  terms: ['service', 'account', 'acceptable', 'availability', 'liability', 'changes'],
  privacy: [
    'controller',
    'collected',
    'purpose',
    'sharing',
    'retention',
    'security',
    'rights',
    'cookies',
    'children',
    'changes',
  ],
  'legal-notice': ['publisher', 'hosting', 'contact', 'ip'],
};
