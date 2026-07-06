import type { Metadata } from "next";
import Brand from "@/components/Brand";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "PizzaFlow — Ordering",
  description: "Validated pizza ordering with live billing, powered by PizzaFlow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Brand />
          <Nav />
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          Powered by PizzaFlow · GST 18% applied on all bills
        </footer>
      </body>
    </html>
  );
}
