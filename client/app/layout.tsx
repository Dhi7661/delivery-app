import type { Metadata, Viewport } from "next";
import { Nunito_Sans } from "next/font/google";
import { BRAND_NAME, BRAND_DESCRIPTION } from "@/lib/brand";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: `${BRAND_NAME} - Local Delivery Service`,
  description: BRAND_DESCRIPTION,
  manifest: "/manifest.json",
};

import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/context/AuthContext";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${nunitoSans.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col bg-background text-text">
        <AuthProvider>
          <CartProvider>{children}</CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
