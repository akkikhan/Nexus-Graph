"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { Inbox, GitBranch, ListOrdered, BarChart3, Settings, Bot, Activity, } from "lucide-react";
export default function DashboardLayout({ children, }) {
    const navItems = [
        { href: "/inbox", icon: Inbox, label: "Inbox" },
        { href: "/stacks", icon: GitBranch, label: "Stacks" },
        { href: "/queue", icon: ListOrdered, label: "Queue" },
        { href: "/activity", icon: Activity, label: "Activity" },
        { href: "/insights", icon: BarChart3, label: "Insights" },
        { href: "/ai-rules", icon: Bot, label: "AI Rules" },
        { href: "/settings", icon: Settings, label: "Settings" },
    ];
    return (<div className="flex h-screen">
            {/* Sidebar */}
            <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col">
                {/* Logo */}
                <div className="p-6 border-b border-zinc-800">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-nexus-500 to-purple-600 flex items-center justify-center">
                            <span className="text-white font-bold text-lg">N</span>
                        </div>
                        <span className="text-xl font-bold text-white">NEXUS</span>
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => (<Link key={item.href} href={item.href} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors">
                            <item.icon className="w-5 h-5"/>
                            <span>{item.label}</span>
                        </Link>))}
                </nav>

                {/* User section */}
                <div className="p-4 border-t border-zinc-800">
                    <div className="flex items-center gap-3 px-4 py-2">
                        <div className="w-8 h-8 rounded-full bg-zinc-700"/>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">User</p>
                            <p className="text-xs text-zinc-500 truncate">user@example.com</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    {children}
                </motion.div>
            </main>
        </div>);
}
//# sourceMappingURL=layout.js.map