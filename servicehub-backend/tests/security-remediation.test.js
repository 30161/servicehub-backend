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

test('serves SEO and agent discovery metadata', async () => {
  const homepage = await request(app).get('/');
  assert.match(homepage.text, /<meta name="description"/);
  assert.match(homepage.text, /<link rel="ard" href="\/.well-known\/ard\.json">/);

  const robots = await request(app).get('/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.text, /User-agent: \*/);

  const llms = await request(app).get('/llms.txt');
  assert.equal(llms.status, 200);
  assert.match(llms.text, /# ProConnect/);

  const ardResponse = await request(app).get('/.well-known/ard.json');
  assert.equal(ardResponse.status, 200);
  assert.equal(ardResponse.body.entries[0].identifier, 'urn:air:pro-connect-g5d5.onrender.com:website');
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
