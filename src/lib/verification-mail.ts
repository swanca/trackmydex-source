import { toUiLocale, type UiLocale } from './catalog/languages';

type VerificationMailCopy = {
  subject: string;
  heading: string;
  body: string;
  action: string;
  footer: string;
};

const COPY: Record<UiLocale, VerificationMailCopy> = {
  en: { subject: 'Confirm your TrackMyDex account', heading: 'Confirm your e-mail', body: 'One click and your collection is ready to sync across devices.', action: 'Confirm my account', footer: 'If this was not you, you can safely ignore this e-mail.' },
  fr: { subject: 'Confirmez votre compte TrackMyDex', heading: 'Confirmez votre e-mail', body: 'Un clic et votre collection pourra être synchronisée sur tous vos appareils.', action: 'Confirmer mon compte', footer: "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail." },
  es: { subject: 'Confirma tu cuenta de TrackMyDex', heading: 'Confirma tu correo', body: 'Un clic y tu colección estará lista para sincronizarse entre dispositivos.', action: 'Confirmar mi cuenta', footer: 'Si no has solicitado esta cuenta, puedes ignorar este correo.' },
  pt: { subject: 'Confirma a tua conta TrackMyDex', heading: 'Confirma o teu e-mail', body: 'Um clique e a tua coleção fica pronta para sincronizar entre dispositivos.', action: 'Confirmar a minha conta', footer: 'Se não foste tu, podes ignorar este e-mail.' },
  it: { subject: 'Conferma il tuo account TrackMyDex', heading: 'Conferma la tua e-mail', body: 'Un clic e la tua collezione sarà pronta a sincronizzarsi tra i dispositivi.', action: 'Conferma il mio account', footer: 'Se non sei stato tu, puoi ignorare questa e-mail.' },
  ja: { subject: 'TrackMyDex アカウントを確認してください', heading: 'メールアドレスの確認', body: 'ワンクリックで、コレクションを端末間で同期できます。', action: 'アカウントを確認', footer: '心当たりがない場合は、このメールを無視してください。' },
};

export function verificationMailCopy(locale: string | null | undefined): VerificationMailCopy {
  return COPY[toUiLocale(locale ?? 'en')];
}
