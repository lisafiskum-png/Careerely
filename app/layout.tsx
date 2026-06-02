import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "Careerely — Applications That Sound Like You",
  description: "Your voice. Every application. Careerely learns how you write and applies to jobs that match — automatically.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ fontFamily: '"Inter", system-ui, -apple-system, sans-serif', background: '#FAFAFA' }}>
        {children}
      </body>
    </html>
  )
}
