const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const request = require('supertest');
const { app } = require('../server');
const { PerformanceAnalysis } = require('../models');

test('performance API validates requests and exposes health and dashboard routes', async () => {
  await mongoose.connection.asPromise();

  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200);

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

  const originalFetch = global.fetch;
  const strategies = [];
  let analysisId;
  global.fetch = async input => {
    strategies.push(new URL(input).searchParams.get('strategy'));
    return {
      ok: true,
      json: async () => ({
        lighthouseResult: {
          categories: { performance: { score: 0.82 } },
          audits: {
            'largest-contentful-paint': { numericValue: 1800 },
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
    assert.deepEqual(strategies.sort(), ['desktop', 'mobile']);
    analysisId = created.body.id;

    const history = await request(app).get('/api/history?limit=1');
    assert.equal(history.status, 200);
    assert.equal(history.body.analyses[0]._id, analysisId);

    const savedReport = await request(app).get(`/api/history/${analysisId}`);
    assert.equal(savedReport.status, 200);
    assert.equal(savedReport.body.desktop.metrics.lcpMs, 1800);
  } finally {
    global.fetch = originalFetch;
    if (analysisId) await PerformanceAnalysis.deleteOne({ _id: analysisId });
  }
});

test.after(async () => {
  await mongoose.disconnect();
});
