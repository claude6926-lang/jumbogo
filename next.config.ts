import type { NextConfig } from 'next';
const config: NextConfig = { devIndicators: false, distDir: process.env.JUMBO_TEST_SANDBOX === 'true' && process.env.NODE_ENV === 'development' ? '.next-sandbox' : process.env.NODE_ENV === 'development' ? '.next-dev' : '.next', serverExternalPackages: ['node:sqlite'], async headers() { return [{ source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }] }]; } };
export default config;


