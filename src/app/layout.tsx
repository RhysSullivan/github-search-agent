import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/navbar";
import { ConvexClientProvider } from "./ConvexClientProvider";

export const metadata: Metadata = {
  title: "GitHub Search Agent",
  description: "AI-powered GitHub search assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className="h-full antialiased">
        <ConvexClientProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <Navbar />
            {children}
          </ThemeProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}

