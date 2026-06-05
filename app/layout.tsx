import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "智能批量下单系统",
  description: "AI 驱动的智能多格式批量下单系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={inter.className}>
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
