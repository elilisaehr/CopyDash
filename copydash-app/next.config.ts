import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel already adds Strict-Transport-Security. The referrer rule keeps
  // invitation links (their token is in the address) from leaking to other sites.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // Old addresses of the single space (links in emails already sent).
  // /pm/clients and /client/* are handled by small redirect pages in app/.
  redirects() {
    return [
      { source: "/pm", destination: "/dashboard", permanent: false },
      { source: "/pm/projects/:path*", destination: "/projects/:path*", permanent: false },
      { source: "/pm/projects", destination: "/projects", permanent: false },
      { source: "/pm/settings", destination: "/settings", permanent: false },
      { source: "/pm/help", destination: "/help", permanent: false },
    ];
  },
};

export default nextConfig;
