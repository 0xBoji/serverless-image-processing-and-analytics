import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Image Analytics | Cloud Vision Dashboard",
  description: "Upload images and analyze them with AWS Rekognition. Detect objects, scenes, and labels with AI-powered image processing.",
  keywords: ["image analytics", "aws rekognition", "cloud vision", "object detection", "image processing"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange={false}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
