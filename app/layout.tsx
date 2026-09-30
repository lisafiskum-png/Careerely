import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

// Master Brief → Typography: Inter, all weights, optical sizing.
const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://careerely.ai"),
  title: "Careerely — Stop searching for jobs",
  description: "Careerely is an AI career agent. It finds and ranks opportunities for you, then prepares a tailored resume and cover letter for the best ones.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
      </body>
    </html>
  )
}
