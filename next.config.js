const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** Hostnames allowed to load dev-only assets (HMR, etc.) when not using localhost — e.g. iPad at http://192.168.x.x:3000 */
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS || "192.168.1.146")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  ...(allowedDevOrigins.length ? { allowedDevOrigins } : {}),

  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
