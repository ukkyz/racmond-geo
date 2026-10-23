import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Racmond — Data Center Operations Platform",
  description:
    "Racmond unifies fleet inventory, containers, workflow automation, APM service maps, local CLI access and an AI agent into one data-center operations platform.",
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
