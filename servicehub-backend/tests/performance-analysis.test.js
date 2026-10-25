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
    originLoadingExperience: { id: 'example.com', metrics: { INP: { percentile: 210 } } },
    analysisUTCTimestamp: '2026-10-23T10:01:00.000Z',
    lighthouseResult: {
      lighthouseVersion: '12.0.0',
      fetchTime: '2026-10-23T10:00:00.000Z',
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://www.example.com/',
      userAgent: 'Lighthouse test agent',
      configSettings: { formFactor: 'mobile' },
      runWarnings: ['Test warning'],
      categories: {
        performance: { score: 0.91, title: 'Performance', description: 'Performance category' },
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
        'network-requests': {
          details: {
            items: [
              { resourceType: 'Document', networkRequestTime: 100, networkEndTime: 225 },
              { networkEndTime: 2450 }
            ]
          }
        },
        'render-blocking-resources': {
          score: 0.5,
          title: 'Eliminate render-blocking resources',
          description: 'Reduce blocking.',
          details: { items: [{ url: 'https://example.com/style.css', wastedMs: 120 }] }
        },
        'good-audit': { score: 1, title: 'Good audit' },
        'not-rated': { score: null, title: 'Informational audit' }
      }
    }
  }, 'mobile');

  assert.equal(result.strategy, 'mobile');
  assert.equal(result.lighthouse.version, '12.0.0');
  assert.equal(result.lighthouse.finalUrl, 'https://www.example.com/');
  assert.equal(result.lighthouse.configSettings.formFactor, 'mobile');
  assert.equal(result.analysisUTCTimestamp, '2026-10-23T10:01:00.000Z');
  assert.deepEqual(result.lighthouse.runWarnings, ['Test warning']);
  assert.equal(result.score, 91);
  assert.deepEqual(result.auditHealth, { passed: 1, assessed: 2, percentage: 50 });
  assert.deepEqual(result.riskFactors, [{
    id: 'render-blocking-resources',
    title: 'Eliminate render-blocking resources',
    score: 0.5,
    priority: 'medium',
    whatToFix: 'Reduce blocking.',
    measuredImpact: null
  }]);
  assert.equal(result.categories.performance, 91);
  assert.equal(result.categoryDetails.performance.description, 'Performance category');
  assert.equal(result.metrics.pageLoadTimeMs, 2450);
  assert.equal(result.metrics.interactiveMs, 2400);
  assert.equal(result.metrics.serverResponseTimeMs, 120);
  assert.equal(result.metrics.httpResponseTimeMs, 125);
  assert.equal(result.metrics.inpMs, 180);
  assert.equal(result.metrics.totalRequests, 2);
  assert.equal(result.metrics.transferSizeBytes, 64000);
  assert.deepEqual(result.resources, [{ type: 'Script', requestCount: 2, transferSizeBytes: 32000 }]);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].id, 'render-blocking-resources');
  assert.deepEqual(result.audits['render-blocking-resources'].details.items, [
    { url: 'https://example.com/style.css', wastedMs: 120 }
  ]);
  assert.deepEqual(result.fieldData.origin, {
    id: 'example.com',
    metrics: { INP: { percentile: 210 } }
  });
});

test('returns unavailable values instead of inventing missing metrics', () => {
  const result = extractPageSpeedResult({
    lighthouseResult: {
      categories: {},
      audits: { 'network-requests': { details: { items: [] } } }
    }
  }, 'desktop');

  assert.equal(result.score, null);
  assert.deepEqual(result.auditHealth, { passed: 0, assessed: 0, percentage: null });
  assert.deepEqual(result.riskFactors, []);
  assert.equal(result.metrics.lcpMs, null);
  assert.equal(result.metrics.inpMs, null);
  assert.equal(result.metrics.httpResponseTimeMs, null);
  assert.equal(result.metrics.pageLoadTimeMs, null);
  assert.deepEqual(result.resources, []);
  assert.deepEqual(result.recommendations, []);
});
