const baseUrl = process.env.PERF_URL || 'http://localhost:5000/api/books';
const requestCount = Number(process.env.PERF_REQUESTS || 100);
const concurrency = Number(process.env.PERF_CONCURRENCY || 10);

async function measure() {
  const durations = [];
  let nextRequest = 0;

  async function worker() {
    while (nextRequest < requestCount) {
      nextRequest += 1;
      const start = performance.now();
      const response = await fetch(baseUrl);
      await response.arrayBuffer();
      if (!response.ok) throw new Error(`Catalogue request returned HTTP ${response.status}.`);
      durations.push(performance.now() - start);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, requestCount) }, worker));
  durations.sort((left, right) => left - right);
  const p90Index = Math.max(0, Math.ceil(durations.length * 0.9) - 1);
  const result = {
    url: baseUrl,
    requests: requestCount,
    concurrency: Math.min(concurrency, requestCount),
    p50Ms: Number(durations[Math.floor(durations.length * 0.5)].toFixed(2)),
    p90Ms: Number(durations[p90Index].toFixed(2)),
    maxMs: Number(durations.at(-1).toFixed(2)),
    targetMs: 3000,
    targetMet: durations[p90Index] <= 3000,
  };
  console.log(JSON.stringify(result, null, 2));
}

await measure();
