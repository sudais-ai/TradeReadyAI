import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import { Navbar } from "@/components/layout/Navbar";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { getLocaleCookie } from "@/actions/i18n";
import "@/lib/env-validation";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TradeReady AI",
  description: "AI-powered trade-readiness assistant.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocaleCookie();

  return (
    <html lang={locale} className={`${spaceGrotesk.variable} ${dmSans.variable} font-sans antialiased scroll-smooth`} suppressHydrationWarning>
      <body className="min-h-screen flex flex-col" suppressHydrationWarning>
        <AuthProvider>
          <I18nProvider initialLocale={locale}>
            <Navbar>{children}</Navbar>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
