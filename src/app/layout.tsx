import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Studio",
  description: "Start frame + end frame → AI動画生成",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
