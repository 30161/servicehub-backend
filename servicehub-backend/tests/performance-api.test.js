const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const request = require('supertest');
const { app, runScheduledPerformanceAnalysis } = require('../server');
const { PerformanceAnalysis } = require('../models');

test('performance API validates requests and exposes health and dashboard routes', async () => {
  await mongoose.connection.asPromise();

  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.database, 'connected');

  const invalidAnalysis = await request(app)
    .post('/api/analyze')
    .send({ url: 'file:///etc/passwd' });
  assert.equal(invalidAnalysis.status, 400);
  assert.match(invalidAnalysis.body.error, /HTTP or HTTPS/);

  const invalidHistoryId = await request(app).get('/api/history/not-an-object-id');
  assert.equal(invalidHistoryId.status, 400);
  assert.equal(invalidHistoryId.body.error, 'Invalid analysis ID.');

  const dashboard = await request(app).get('/performance/');
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.text, /Pulse — Web performance/);
  const dashboardDeepLink = await request(app).get('/performance/reports/latest');
  assert.equal(dashboardDeepLink.status, 200);
  assert.match(dashboardDeepLink.text, /Pulse — Web performance/);
  const proconnectHome = await request(app).get('/');
  assert.equal(proconnectHome.status, 200);
  assert.match(proconnectHome.text, /ProConnect/);

  const originalFetch = global.fetch;
  const strategies = [];
  let analysisId;
  let scheduledAnalysisId;
  global.fetch = async input => {
    strategies.push(new URL(input).searchParams.get('strategy'));
    return {
      ok: true,
      json: async () => ({
        loadingExperience: { id: 'pulse-test.example', metrics: { INP: { percentile: 175 } } },
        lighthouseResult: {
          lighthouseVersion: '12.0.0',
          fetchTime: '2026-10-23T10:00:00.000Z',
          finalUrl: 'https://pulse-test.example/',
          categories: {
            performance: { score: 0.82 },
            accessibility: { score: 0.94 }
          },
          audits: {
            'largest-contentful-paint': { numericValue: 1800 },
            'diagnostic-test': {
              score: 0.5,
              title: 'Diagnostic test',
              details: { items: [{ description: 'Full audit detail' }] }
            },
            'network-requests': { details: { items: [{ networkEndTime: 2100 }] } },
            'resource-summary': { details: { items: [] } }
          }
        }
      })
    };
  };

  try {
    const created = await request(app)
      .post('/api/analyze')
      .send({ url: 'https://pulse-test.example' });
    assert.equal(created.status, 201);
    assert.equal(created.body.desktop.score, 82);
    assert.equal(created.body.mobile.score, 82);
    assert.equal(created.body.desktop.lighthouse.version, '12.0.0');
    assert.equal(created.body.desktop.categories.accessibility, 94);
    assert.equal(created.body.desktop.fieldData.page.metrics.INP.percentile, 175);
    assert.equal(created.body.mobile.audits['diagnostic-test'].details.items[0].description, 'Full audit detail');
    assert.deepEqual(created.body.mobile.riskFactors[0].whatToFix, 'Full audit detail');
    assert.equal(created.body.mobile.auditHealth.percentage, 0);
    assert.deepEqual(strategies.sort(), ['desktop', 'mobile']);
    analysisId = created.body.id;

    const history = await request(app).get('/api/history?limit=1');
    assert.equal(history.status, 200);
    assert.equal(history.body.analyses[0]._id, analysisId);
    assert.equal(history.body.analyses[0].status, 'success');
    assert.equal(history.body.scheduler.intervalMs, 60_000);
    assert.equal(history.body.analyses[0].mobile.auditHealth.assessed, 1);

    const latest = await request(app).get('/api/latest');
    assert.equal(latest.status, 200);
    assert.equal(latest.body.id, analysisId);
    assert.equal(latest.body.websiteUrl, 'https://pulse-test.example/');

    const savedReport = await request(app).get(`/api/history/${analysisId}`);
    assert.equal(savedReport.status, 200);
    assert.equal(savedReport.body.desktop.metrics.lcpMs, 1800);
    assert.equal(savedReport.body.desktop.lighthouse.finalUrl, 'https://pulse-test.example/');
    assert.equal(savedReport.body.desktop.audits['diagnostic-test'].details.items[0].description, 'Full audit detail');
    assert.equal(savedReport.body.desktop.auditHealth.percentage, 0);
    assert.equal(savedReport.body.desktop.riskFactors[0].whatToFix, 'Full audit detail');

    let scheduledFetchCalls = 0;
    global.fetch = async input => {
      scheduledFetchCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 25));
      return {
        ok: true,
        json: async () => ({
          lighthouseResult: {
            categories: { performance: { score: 0.82 } },
            audits: {
              'largest-contentful-paint': { numericValue: 1800 },
              'network-requests': { details: { items: [] } },
              'resource-summary': { details: { items: [] } }
            }
          }
        })
      };
    };
    const scheduledRun = runScheduledPerformanceAnalysis();
    const overlappingManualTest = await request(app)
      .post('/api/analyze')
      .send({ url: 'https://pulse-test.example' });
    assert.equal(overlappingManualTest.status, 409);
    await scheduledRun;
    assert.equal(scheduledFetchCalls, 2);
    const scheduledAnalysis = await PerformanceAnalysis.findOne({
      websiteUrl: 'https://pulse-test.example/',
      trigger: 'scheduled'
    }).sort({ analyzedAt: -1 });
    assert.ok(scheduledAnalysis);
    assert.equal(scheduledAnalysis.status, 'success');
    scheduledAnalysisId = scheduledAnalysis._id;
  } finally {
    global.fetch = originalFetch;
    if (analysisId) await PerformanceAnalysis.deleteOne({ _id: analysisId });
    if (scheduledAnalysisId) await PerformanceAnalysis.deleteOne({ _id: scheduledAnalysisId });
  }
});

test.after(async () => {
  await mongoose.disconnect();
});
