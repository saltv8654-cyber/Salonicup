/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    // Native canvas (graphics) and the Anthropic SDK stay as Node modules, not bundled.
    serverComponentsExternalPackages: ["@anthropic-ai/sdk", "@napi-rs/canvas"],
    // Fonts are read from disk by the graphics renderer inside server functions.
    outputFileTracingIncludes: { "/**": ["./public/fonts/**"] },
  },
};
