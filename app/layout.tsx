import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css"

// Master Brief → Typography: Inter, all weights, optical sizing.
const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://careerely.ai"),
  applicationName: "Careerely",
  title: "Careerely — Stop searching for jobs",
  description: "Careerely is an AI career agent. It finds and ranks opportunities for you, then prepares a tailored resume and cover letter for the best ones.",
  icons: { icon: "/icon.svg" },
  category: "career",
  openGraph: {
    type: "website",
    siteName: "Careerely",
    title: "Careerely — Stop searching for jobs",
    description: "Upload your resume once. Careerely finds relevant opportunities and prepares tailored applications for your strongest matches.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Careerely — Stop searching for jobs",
    description: "Upload your resume once. Careerely finds relevant opportunities and prepares tailored applications for your strongest matches.",
  },
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
