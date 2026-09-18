import { notFound } from "next/navigation";

/**
 * Catch-all route — any path not matched by an explicit route
 * triggers the root not-found.tsx with a proper 404 status code.
 *
 * This prevents probes like /.env, /wp-admin, /.git, etc. from
 * receiving a 200 response with page content.
 */
export default function CatchAll() {
  notFound();
}
