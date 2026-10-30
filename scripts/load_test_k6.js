import http from 'k6/http';
import { check, sleep } from 'k6';

// F20 Performance Target Configuration (from Plan Section 11)
// - 50 concurrent users
// - Catalog API under 300 ms (95th percentile)
// - Checkout API under 800 ms
// - Error rate under 1%
export const options = {
  stages: [
    { duration: '10s', target: 20 }, // Ramp up to 20 users
    { duration: '20s', target: 50 }, // 50 concurrent users soft launch target
    { duration: '10s', target: 0 },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'], // 95% of requests must complete below 300ms
    http_req_failed: ['rate<0.01'],    // Error rate must be under 1%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:4000/api';

export default function () {
  // 1. Fetch categories (cached)
  const catRes = http.get(`${BASE_URL}/categories`);
  check(catRes, {
    'categories status 200': (r) => r.status === 200,
    'categories fast < 300ms': (r) => r.timings.duration < 300,
  });

  sleep(0.5);

  // 2. Search products
  const searchRes = http.get(`${BASE_URL}/products/search?q=atta`);
  check(searchRes, {
    'search status 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // 3. Health & telemetry check
  const healthRes = http.get(`${BASE_URL}/monitoring/health`);
  check(healthRes, {
    'health check status 200': (r) => r.status === 200,
  });

  sleep(1);
}
