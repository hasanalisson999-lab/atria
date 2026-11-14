import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif, Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/providers";
import { FOLD_SCRIPT } from "@/lib/fold-script";
import "./globals.css";
import "./ui-themes.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });
// Fonts of the optional interface styles (Paper, Neon): not preloaded, so they cost nothing until picked.
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", display: "swap", preload: false });
const space = Space_Grotesk({ variable: "--font-space", subsets: ["latin"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Atria", template: "%s · Atria" },
  description: "Ad intelligence for fitness and activewear brands: discover, track and analyze winning ads.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${archivo.variable} ${jetbrains.variable} ${instrument.variable} ${space.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: FOLD_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
