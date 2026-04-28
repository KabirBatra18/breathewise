/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  // Lock prod source maps away from casual inspection; middleware also
  // sets X-Robots-Tag so crawlers shouldn't index anything anyway.
  productionBrowserSourceMaps: false,
};

export default nextConfig;
