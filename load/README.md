# Catalogue Performance Check

With MongoDB seeded and the API running, execute:

```bash
PERF_REQUESTS=100 PERF_CONCURRENCY=10 npm run performance
```

The script performs concurrent `GET /api/books` requests, reports p50/p90/max latency and compares p90 with the SRS target of 3000 ms. It does not claim a result until it is actually run against a running local or deployed API.
