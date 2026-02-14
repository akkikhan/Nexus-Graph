import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

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
            <body className="font-sans">
                <div className="min-h-screen bg-[#0a0a0a]">
                    <Providers>{children}</Providers>
                </div>
            </body>
        </html>
    );
}
