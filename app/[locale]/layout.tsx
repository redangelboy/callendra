import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import RecaptchaProvider from "./recaptcha-provider";
import { getMessages } from "next-intl/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Callendra",
  description: "The booking system for your business",
};

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
    <html lang={locale}>
      <body className="min-h-screen antialiased bg-[var(--callendra-bg)] text-[var(--callendra-text-primary)]">
        <NextIntlClientProvider messages={messages}>
          <RecaptchaProvider>
            {children}
          </RecaptchaProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}