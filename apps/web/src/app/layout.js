import { Inter } from "next/font/google";
import "./globals.css";
const inter = Inter({ subsets: ["latin"] });
export const metadata = {
    title: "NEXUS - Code Review, Reimagined",
    description: "Next-generation AI-powered code review platform with stacked PRs",
    icons: {
        icon: "/favicon.ico",
    },
};
export default function RootLayout({ children, }) {
    return (<html lang="en" className="dark">
            <body className={inter.className}>
                <div className="min-h-screen bg-[#0a0a0a]">{children}</div>
            </body>
        </html>);
}
//# sourceMappingURL=layout.js.map