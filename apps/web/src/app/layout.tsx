import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "NEXUS - Code Review, Reimagined",
    description: "Next-generation AI-powered code review platform with stacked PRs",
    icons: {
        icon: "/favicon.ico",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark">
            <body className={inter.className}>
                <div className="min-h-screen bg-[#0a0a0a]">
                    <Providers>{children}</Providers>
                </div>
            </body>
        </html>
    );
}
