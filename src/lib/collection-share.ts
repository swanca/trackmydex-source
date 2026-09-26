export type ShareDestinationId = 'email' | 'facebook' | 'x' | 'reddit';

export interface ShareDestination {
  id: ShareDestinationId;
  href: string;
}

export function createShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function isShareToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function buildShareDestinations({
  url,
  title,
  text,
}: {
  url: string;
  title: string;
  text: string;
}): ShareDestination[] {
  const email = new URL('mailto:');
  email.search = new URLSearchParams({ subject: title, body: `${text}\n\n${url}` }).toString();

  const facebook = new URL('https://www.facebook.com/sharer/sharer.php');
  facebook.search = new URLSearchParams({ u: url }).toString();

  const x = new URL('https://twitter.com/intent/tweet');
  x.search = new URLSearchParams({ text, url }).toString();

  const reddit = new URL('https://www.reddit.com/submit');
  reddit.search = new URLSearchParams({ title, url }).toString();

  return [
    { id: 'email', href: email.toString() },
    { id: 'facebook', href: facebook.toString() },
    { id: 'x', href: x.toString() },
    { id: 'reddit', href: reddit.toString() },
  ];
}
