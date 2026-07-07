import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // The template library is read from /templates with fs at request/build time.
  // Make sure the JSON files ship with the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    '/**': [path.join(__dirname, 'templates', '*.json')],
  },
};

export default nextConfig;
