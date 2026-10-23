/** @type {import('next').NextConfig} */

const isDevelopment =
  process.env.NODE_ENV === "development";

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=()",
  },

  ...(isDevelopment
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value:
            "max-age=63072000; includeSubDomains; preload",
        },
      ]),

  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",

      isDevelopment
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com"
        : "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",

      "style-src 'self' 'unsafe-inline'",

      // Company logo/banner may come from S3,
      // CloudFront or another HTTPS source.
      "img-src 'self' data: blob: https:",

      "font-src 'self' data: https:",

      // Required for Razorpay Checkout API/network calls.
      "connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com",

      // Required because Razorpay Checkout may render inside hosted frames.
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",

      "frame-ancestors 'none'",

      "base-uri 'self'",

      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;