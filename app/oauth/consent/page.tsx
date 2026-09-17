import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabasePublicKey } from "@/lib/supabase/public-key";

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: { authorization_id?: string };
}) {
  const authorizationId = searchParams.authorization_id;

  if (!authorizationId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-bold text-red-400 mb-2">Error</h1>
          <p className="text-gray-300">Missing authorization_id parameter</p>
        </div>
      </div>
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey()!,
    {
      cookies: {
        getAll: async () => (await cookies()).getAll(),
        setAll: async (cookiesToSet) => {
          const cookieStore = await cookies();
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?redirect=/oauth/consent?authorization_id=${authorizationId}`
    );
  }

  const { data: authDetails, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !authDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-bold text-red-400 mb-2">Error</h1>
          <p className="text-gray-300">
            {error?.message || "Invalid authorization request"}
          </p>
        </div>
      </div>
    );
  }

  const scopeDescriptions: Record<string, string> = {
    openid: "Access your basic profile information",
    email: "Access your email address",
    profile: "Access your profile details",
    phone: "Access your phone number",
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface border border-border rounded-lg p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-100 mb-2">
            Authorize Application
          </h1>
          <p className="text-gray-400 text-sm">
            {authDetails.client.name} wants to access your Four Corners account
          </p>
        </div>

        <div className="bg-background border border-border rounded-lg p-4 mb-6 space-y-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Application
            </p>
            <p className="text-gray-200 font-medium">
              {authDetails.client.name}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Redirect URI
            </p>
            <p className="text-gray-400 text-sm break-all">
              {authDetails.redirect_url}
            </p>
          </div>

          {authDetails.scope && authDetails.scope.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                Requested Permissions
              </p>
              <ul className="space-y-2">
                {authDetails.scope.split(" ").map((scopeItem) => (
                  <li key={scopeItem} className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-accent mt-0.5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <p className="text-gray-300 text-sm font-medium">
                        {scopeItem}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {scopeDescriptions[scopeItem] ||
                          "Access specific data from your account"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 mb-6">
          <p className="text-xs text-gray-400">
            By approving, you allow {authDetails.client.name} to access the
            requested information. You can revoke access at any time from your
            account settings.
          </p>
        </div>

        <form action="/api/oauth/decision" method="POST" className="space-y-3">
          <input
            type="hidden"
            name="authorization_id"
            value={authorizationId}
          />
          <button
            type="submit"
            name="decision"
            value="approve"
            className="w-full px-4 py-3 bg-accent hover:bg-accent/90 text-gray-900 font-medium rounded-lg transition-colors"
          >
            Approve
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            className="w-full px-4 py-3 bg-surface-alt hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors border border-border"
          >
            Deny
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 mt-6">
          Logged in as {user.email}
        </p>
      </div>
    </div>
  );
}
