const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');

process.env.MONGODB_URI = '';
delete process.env.MONGO_URI;

const { app } = require('../server');

test('does not silently collect click activity', async () => {
  const homepage = await request(app).get('/');
  assert.equal(homepage.status, 200);
  assert.doesNotMatch(homepage.text, /CLICK_EVENT|activity\/log|logUserActivity/);

  const safeRenderScript = await request(app).get('/safe-render.js');
  assert.equal(safeRenderScript.status, 200);
  assert.match(safeRenderScript.text, /escapeInlineArgument/);

  const removedEndpoint = await request(app)
    .post('/api/activity/log')
    .send({ actionType: 'CLICK_EVENT' });
  assert.equal(removedEndpoint.status, 404);
});

test('requires a valid authenticated provider before changing a provider listing', async () => {
  const response = await request(app)
    .post('/api/providers')
    .send({
      name: 'Unauthorized Provider',
      service: 'Plumbing',
      creatorEmail: 'provider@example.com'
    });

  assert.equal(response.status, 401);
});
