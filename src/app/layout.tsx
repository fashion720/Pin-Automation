import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pin Batch — Auto Pin Generator",
  description: "Article link do, batch mein pins bana lo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <nav className="border-b border-border">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <a href="/" className="font-semibold tracking-tight text-lg">
              Pin<span className="text-accent">Batch</span>
            </a>
            <div className="flex items-center gap-3">
              <a
                href="/templates"
                className="text-sm text-muted hover:text-foreground transition"
              >
                Templates
              </a>
              <a
                href="/schedule"
                className="text-sm text-muted hover:text-foreground transition"
              >
                Schedule
              </a>
              <a
                href="/api/export"
                className="text-sm text-muted hover:text-foreground transition"
              >
                Claude CSV
              </a>
              <a
                href="/create"
                className="text-sm bg-accent text-white px-4 py-2 rounded-full hover:opacity-90 transition"
              >
                + Create a Post
              </a>
            </div>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
