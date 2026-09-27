import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOEL BABA RESTORAN — Admin",
  description: "NOEL BABA RESTORAN restaurant management dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}