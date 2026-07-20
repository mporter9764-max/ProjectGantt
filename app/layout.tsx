import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProjectMgt",
  description: "Multi-project Gantt planning with linked meeting notes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
