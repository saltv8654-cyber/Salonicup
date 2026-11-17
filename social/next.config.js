/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk"],
    // Fonts and logo are read from disk by the graphics renderer inside server functions.
    outputFileTracingIncludes: { "/**": ["./public/fonts/**", "./public/logo.png"] },
  },
};
