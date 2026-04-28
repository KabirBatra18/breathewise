import { notFound } from "next/navigation";

// Catch-all route: any URL that isn't a real route renders the stock Next.js
// 404. No branding, no "this app exists" hints — the page looks identical to
// a default 404 from any Next.js deployment.
export default function CatchAll() {
  notFound();
}
