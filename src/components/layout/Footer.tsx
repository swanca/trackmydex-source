import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

const WHATNOT_COPY: Record<string, { title: string; body: string; link: string }> = {
  fr: {
    title: "Acheter des cartes Pokémon en live sur Whatnot",
    body: "Ventes en direct, cartes à l'unité et boosters Pokémon, notamment autour des éditions anniversaire. Jusqu'à 200 € offerts selon les conditions affichées.",
    link: "Voir l'offre Whatnot",
  },
  en: {
    title: 'Buy Pokemon cards live on Whatnot',
    body: 'Live sales, single cards and Pokemon booster packs. Up to €200 offered subject to the displayed conditions.',
    link: 'View the Whatnot offer',
  },
  es: {
    title: 'Compra cartas Pokémon en directo en Whatnot',
    body: 'Ventas en directo, cartas sueltas y sobres Pokémon. Hasta 200 € ofrecidos según las condiciones mostradas.',
    link: 'Ver la oferta de Whatnot',
  },
  pt: {
    title: 'Comprar cartas Pokémon ao vivo na Whatnot',
    body: 'Vendas ao vivo, cartas avulsas e boosters Pokémon. Até 200 € oferecidos conforme as condições apresentadas.',
    link: 'Ver a oferta Whatnot',
  },
  it: {
    title: 'Acquista carte Pokémon dal vivo su Whatnot',
    body: 'Vendite live, carte singole e booster Pokémon. Fino a 200 € offerti secondo le condizioni mostrate.',
    link: "Vedi l'offerta Whatnot",
  },
  ja: {
    title: 'Whatnotでポケモンカードをライブ購入',
    body: 'ライブ販売、カード、ポケモンのブースターパック。表示条件により最大200ユーロ相当の特典があります。',
    link: 'Whatnotのオファーを見る',
  },
};

/**
 * The footer exists for the legal links and nothing else.
 *
 * Kept deliberately thin: on a phone every row here is a row not showing
 * cards, and these are pages people visit once if ever. The trademark line
 * stays visible though - an unofficial tracker should say so on every page,
 * not bury it three clicks deep.
 */
export async function Footer() {
  const t = await getTranslations();
  const locale = await getLocale();
  const whatnot = WHATNOT_COPY[locale] ?? WHATNOT_COPY.en!;

  return (
    <footer className="mt-12 border-t border-hairline px-5 pt-6 pb-8 lg:px-8">
      <section className="mb-5 max-w-[72ch] text-[0.75rem] leading-relaxed text-muted">
        <h2 className="mb-1 font-semibold text-paper">{whatnot.title}</h2>
        <p>
          {whatnot.body}{' '}
          <a
            href="https://whatnot.com/invite/imfromfar"
            target="_blank"
            rel="noopener noreferrer sponsored nofollow"
            className="font-semibold text-amber underline underline-offset-2"
          >
            {whatnot.link}
          </a>
        </p>
      </section>
      <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[0.75rem] text-muted">
        <Link href="/tutorial" className="transition-colors hover:text-paper">
          {t('tutorial.title')}
        </Link>
        <Link href="/methodology" className="transition-colors hover:text-paper">
          {t('methodology.title')}
        </Link>
        <Link href="/legal/terms" className="transition-colors hover:text-paper">
          {t('legal.terms.title')}
        </Link>
        <Link href="/legal/privacy" className="transition-colors hover:text-paper">
          {t('legal.privacy.title')}
        </Link>
        <Link href="/legal/legal-notice" className="transition-colors hover:text-paper">
          {t('legal.legal-notice.title')}
        </Link>
      </nav>
      <p className="mt-3 max-w-[68ch] text-[0.6875rem] leading-relaxed text-faint">
        {t('legal.trademark')}
      </p>
    </footer>
  );
}
