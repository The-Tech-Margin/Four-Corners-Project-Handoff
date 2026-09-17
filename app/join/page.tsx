import { FourCornersLogo } from "@/components/four-corners-logo";
import { RequestAccessForm } from "@/components/invites/request-form";

export const metadata = {
  title: "Request access — Four Corners",
  description:
    "Ask to join Four Corners. Tell us your name, organization, and email — we'll review and follow up.",
};

export default function JoinPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--fc-bg)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "var(--fc-surface)",
          border: "1px solid var(--fc-border)",
        }}
      >
        <div className="px-6 py-8">
          <div className="flex justify-center mb-6">
            <FourCornersLogo className="w-16 h-16" />
          </div>

          <h1
            className="text-center text-xl font-medium mb-6"
            style={{ color: "var(--fc-text)" }}
          >
            Request access
          </h1>
          <RequestAccessForm />
        </div>
      </div>
    </div>
  );
}
