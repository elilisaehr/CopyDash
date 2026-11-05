import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
