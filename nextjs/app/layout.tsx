import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import { Navbar } from "@/components/ui/Navbar";

export const metadata: Metadata = {
  title: "AION Yield — Private Bitcoin Yield on Starknet",
  description:
    "Earn BTC yield privately. Commitment-based positions, ZK-ready withdrawals, dual yield from Vesu + Ekubo.",
  icons: { icon: "/favicon.ico" },
  openGraph: {
    title: "AION Yield",
    description: "The first private Bitcoin yield protocol on Starknet",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Navbar />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
