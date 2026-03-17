/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the frontend dev server to proxy WebSocket to the FastAPI backend
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
