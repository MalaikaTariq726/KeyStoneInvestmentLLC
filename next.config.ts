import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Claims and expenses carry their receipts (images/PDF, up to 4 MB in total) in the request.
    serverActions: { bodySizeLimit: "5mb" },
  },
  // The company website is plain HTML in public/ (index.html + assets/). Serve it at "/";
  // the employee portal lives at /login and /portal on the same site.
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
