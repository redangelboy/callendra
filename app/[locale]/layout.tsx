import { NextIntlClientProvider } from "next-intl";
import RecaptchaProvider from "./recaptcha-provider";
import { getMessages } from "next-intl/server";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <div
      lang={locale}
      className="min-h-screen antialiased bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)]"
    >
      <NextIntlClientProvider messages={messages}>
        <RecaptchaProvider>{children}</RecaptchaProvider>
      </NextIntlClientProvider>
    </div>
  );
}