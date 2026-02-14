import { Suspense } from "react";
import InboxClient from "./InboxClient";

function InboxLoading() {
    return (
        <div className="p-8 flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nexus-500" />
        </div>
    );
}

export default function InboxPage() {
    // `useSearchParams()` must be used inside a client component that is wrapped in Suspense
    // to avoid Next.js prerender errors.
    return (
        <Suspense fallback={<InboxLoading />}>
            <InboxClient />
        </Suspense>
    );
}

