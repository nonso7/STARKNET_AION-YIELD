/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "bufferutil",
        "utf-8-validate",
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
