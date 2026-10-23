import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DC Monitor — Data Center Asset Observability",
  description:
    "Monitor physical and virtual data center server assets on an OpenStreetMap dashboard with ownership, geo-location, project and tag filtering.",
};

const themeInitScript = `
(function() {
  try {
    var s = localStorage.getItem('dc-monitor-theme');
    var t = (s === 'light' || s === 'dark') ? s : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
