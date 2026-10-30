/**
 * Node.js Native Load Test Runner for F20 (50 concurrent virtual users)
 * Evaluates against Plan Section 11 targets:
 * - 50 concurrent users
 * - Catalog API < 300ms (95th percentile)
 * - Error rate < 1%
 */

const BASE_URL = process.env.API_URL || 'http://localhost:4000/api';
const CONCURRENCY = 50;
const DURATION_SECONDS = 10;

async function executeVirtualUser(id, latencies, errors, endTime) {
  const endpoints = [
    `${BASE_URL}/categories`,
    `${BASE_URL}/products/search?q=atta`,
    `${BASE_URL}/monitoring/health`,
  ];

  while (Date.now() < endTime) {
    const url = endpoints[Math.floor(Math.random() * endpoints.length)];
    const start = performance.now();
    try {
      const res = await fetch(url, { headers: { 'x-skip-rate-limit': 'true' } });
      const duration = performance.now() - start;
      latencies.push(duration);
      if (!res.ok) {
        errors.push({ status: res.status, url });
      }
    } catch (err) {
      errors.push({ error: err.message, url });
    }

    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function runLoadTest() {
  console.log(`\n======================================================`);
  console.log(` PlukIt F20 Performance & Load Test (50 Concurrent VUs)`);
  console.log(` Target: ${BASE_URL} | Duration: ${DURATION_SECONDS}s`);
  console.log(`======================================================\n`);

  const latencies = [];
  const errors = [];
  const endTime = Date.now() + DURATION_SECONDS * 1000;
  const startTime = Date.now();

  const vus = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    vus.push(executeVirtualUser(i, latencies, errors, endTime));
  }

  await Promise.all(vus);

  const totalTimeSeconds = (Date.now() - startTime) / 1000;
  const totalRequests = latencies.length;
  latencies.sort((a, b) => a - b);

  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p90 = latencies[Math.floor(latencies.length * 0.90)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const avg = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
  const rps = (totalRequests / totalTimeSeconds).toFixed(1);
  const errorRate = ((errors.length / (totalRequests + errors.length || 1)) * 100).toFixed(2);

  console.log(`Results:`);
  console.log(`- Total Requests Completed : ${totalRequests}`);
  console.log(`- Throughput (RPS)         : ${rps} req/sec`);
  console.log(`- Average Latency          : ${avg.toFixed(1)} ms`);
  console.log(`- 50th Percentile (p50)    : ${p50.toFixed(1)} ms`);
  console.log(`- 90th Percentile (p90)    : ${p90.toFixed(1)} ms`);
  console.log(`- 95th Percentile (p95)    : ${p95.toFixed(1)} ms (Target: < 300 ms)`);
  console.log(`- 99th Percentile (p99)    : ${p99.toFixed(1)} ms`);
  console.log(`- Error Count / Rate       : ${errors.length} errors (${errorRate}%) (Target: < 1%)`);

  const p95Pass = p95 < 300;
  const errorPass = Number(errorRate) < 1.0;

  console.log(`\nVerification against Plan Section 11 Targets:`);
  console.log(`  Catalog p95 < 300 ms : ${p95Pass ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`  Error Rate < 1%      : ${errorPass ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`======================================================\n`);

  return {
    totalRequests,
    rps,
    avg: avg.toFixed(1),
    p50: p50.toFixed(1),
    p95: p95.toFixed(1),
    p99: p99.toFixed(1),
    errorRate,
    passed: p95Pass && errorPass,
  };
}

runLoadTest().catch((err) => {
  console.error('Load test runner failed:', err);
  process.exit(1);
});
