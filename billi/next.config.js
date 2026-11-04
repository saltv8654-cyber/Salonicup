/** @type {import('next').NextConfig} */
module.exports = {
  webpack(config) {
    // The migration SQL is shown in the CRM so it can be copied into Supabase.
    config.module.rules.push({ test: /\.sql$/, type: "asset/source" });
    return config;
  },
};
