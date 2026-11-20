import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LiveProvider } from "@/components/providers/LiveProvider";
import { RadioProvider } from "@/components/providers/RadioProvider";
import { AppShell } from "@/components/AppShell";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});
const mono = JetBrains_Mono({ variable: "--font-mono-jb", subsets: ["latin"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: { default: "Alerta 116", template: "%s · Alerta 116" },
  description:
    "Emergencias en tiempo real, radio en vivo, alertas cercanas e identificación de materiales peligrosos para bomberos voluntarios del Perú.",
  applicationName: "Alerta 116",
  appleWebApp: { capable: true, title: "Alerta 116", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0d11",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PE" className={`${inter.variable} ${barlow.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <LiveProvider>
          <RadioProvider>
            <AppShell>{children}</AppShell>
          </RadioProvider>
        </LiveProvider>
      </body>
    </html>
  );
}
