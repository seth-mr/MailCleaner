import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppPreferencesProvider } from "@/components/app-preferences-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const PREFERENCES_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("mailcleaner-theme");if(t==="light"){document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";}else{document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}var l=localStorage.getItem("mailcleaner-lang");if(l==="es"||l==="en"){document.documentElement.lang=l;}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "mailCleaner",
  description: "Clean up spam, old emails, and unwanted subscriptions from your inbox.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: PREFERENCES_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AppPreferencesProvider>{children}</AppPreferencesProvider>
      </body>
    </html>
  );
}
