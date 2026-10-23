const assert = require('node:assert/strict');
const test = require('node:test');
const { extractPageSpeedResult, normalizeWebsiteUrl } = require('../performance-analysis');

test('normalizes valid HTTP and HTTPS URLs', () => {
  assert.equal(normalizeWebsiteUrl(' example.com '), 'https://example.com/');
  assert.equal(normalizeWebsiteUrl('http://example.com/path'), 'http://example.com/path');
});

test('rejects invalid, unsupported, credential-bearing, and oversized URLs', () => {
  for (const value of ['', 'not a url', 'ftp://example.com', 'https://user:pass@example.com', `https://example.com/${'a'.repeat(2050)}`]) {
    assert.throws(() => normalizeWebsiteUrl(value));
  }
  assert.throws(() => normalizeWebsiteUrl(null));
});

test('extracts Lighthouse scores, metrics, resource data, and recommendations', () => {
  const result = extractPageSpeedResult({
    loadingExperience: { metrics: { INP: { percentile: 180 }, CLS: { percentile: 0.02 } } },
    lighthouseResult: {
      categories: {
        performance: { score: 0.91 },
        accessibility: { score: 0.88 }
      },
      audits: {
        interactive: { numericValue: 2400 },
        'server-response-time': { numericValue: 120 },
        'largest-contentful-paint': { numericValue: 1800 },
        'first-contentful-paint': { numericValue: 700 },
        'speed-index': { numericValue: 1400 },
        'total-blocking-time': { numericValue: 90 },
        'cumulative-layout-shift': { numericValue: 0.02 },
        'total-byte-weight': { numericValue: 64000 },
        'resource-summary': { details: { items: [{ label: 'Script', requestCount: 2, transferSize: 32000 }] } },
        'network-requests': { details: { items: [{ networkEndTime: 2450 }, { networkEndTime: 1900 }] } },
        'render-blocking-resources': { score: 0.5, title: 'Eliminate render-blocking resources', description: 'Reduce blocking.' },
        'good-audit': { score: 1, title: 'Good audit' },
        'not-rated': { score: null, title: 'Informational audit' }
      }
    }
  }, 'mobile');

  assert.equal(result.strategy, 'mobile');
  assert.equal(result.score, 91);
  assert.equal(result.categories.performance, 91);
  assert.equal(result.metrics.pageLoadTimeMs, 2450);
  assert.equal(result.metrics.serverResponseTimeMs, 120);
  assert.equal(result.metrics.inpMs, 180);
  assert.equal(result.metrics.totalRequests, 2);
  assert.equal(result.metrics.transferSizeBytes, 64000);
  assert.deepEqual(result.resources, [{ type: 'Script', requestCount: 2, transferSizeBytes: 32000 }]);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].id, 'render-blocking-resources');
});

test('returns unavailable values instead of inventing missing metrics', () => {
  const result = extractPageSpeedResult({
    lighthouseResult: {
      categories: {},
      audits: { 'network-requests': { details: { items: [] } } }
    }
  }, 'desktop');

  assert.equal(result.score, null);
  assert.equal(result.metrics.lcpMs, null);
  assert.equal(result.metrics.inpMs, null);
  assert.equal(result.metrics.pageLoadTimeMs, null);
  assert.deepEqual(result.resources, []);
  assert.deepEqual(result.recommendations, []);
});
