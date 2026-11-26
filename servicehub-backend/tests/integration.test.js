const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const { app } = require('../server');
const { Booking, User } = require('../models');

async function run() {
  const testRunId = randomUUID();
  const customerPayload = {
    name: 'Alice Customer',
    email: `alice.customer.${testRunId}@example.com`,
    password: 'securepass123',
    role: 'customer',
    service: 'Plumbing'
  };

  const providerPayload = {
    name: 'Bob Provider',
    email: `bob.provider.${testRunId}@example.com`,
    password: 'securepass123',
    role: 'provider',
    service: 'Plumbing'
  };

  try {
    await runIntegrationChecks(customerPayload, providerPayload);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await Promise.all([
        Booking.deleteMany({ customerEmail: customerPayload.email }),
        User.deleteMany({ email: { $in: [customerPayload.email, providerPayload.email] } })
      ]);
    }
    await mongoose.disconnect();
  }
}

async function runIntegrationChecks(customerPayload, providerPayload) {
  const customerRegister = await request(app).post('/api/auth/register').send(customerPayload);
  assert.equal(customerRegister.status, 201, 'Customer register should succeed');
  const providerRegister = await request(app).post('/api/auth/register').send(providerPayload);
  assert.equal(providerRegister.status, 201, 'Provider register should succeed');

  const customerToken = customerRegister.body.token;
  const providerToken = providerRegister.body.token;
  const customerId = customerRegister.body.user._id;
  const providerId = providerRegister.body.user._id;

  assert.ok(customerToken, 'Customer token should exist');
  assert.ok(providerToken, 'Provider token should exist');

  const login = await request(app).post('/api/auth/login').send({
    email: customerPayload.email,
    password: customerPayload.password
  });
  assert.equal(login.status, 200, 'Login should succeed for the customer');

  const invalidGoogleStart = await request(app).post('/api/auth/google/start').send({});
  assert.equal(invalidGoogleStart.status, 400, 'Google sign-in should reject missing identity and role data');
  const invalidGoogleOtp = await request(app).post('/api/auth/google/verify').send({});
  assert.equal(invalidGoogleOtp.status, 400, 'Google sign-in should reject missing OTP challenge data');

  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200, 'Health endpoint should resolve');

  const robots = await request(app).get('/robots.txt');
  assert.equal(robots.status, 200, 'robots.txt should be served');
  assert.match(robots.text, /Sitemap:/, 'robots.txt should reference the sitemap');

  const sitemap = await request(app).get('/sitemap.xml');
  assert.equal(sitemap.status, 200, 'Sitemap should be served');
  assert.match(sitemap.text, /pro-connect-g5d5\.onrender\.com/, 'Sitemap should contain the public domain');

  const seoStatus = await request(app).get('/api/seo/status');
  assert.equal(seoStatus.status, 200, 'SEO status endpoint should resolve');
  assert.equal(seoStatus.body.sitemapUrl, 'https://pro-connect-g5d5.onrender.com/sitemap.xml');

  const bookingRes = await request(app).post('/api/bookings').send({
    customerId,
    providerId,
    customerEmail: customerPayload.email,
    service: 'Plumbing',
    date: '2026-10-01',
    timeSlot: '10:00 AM',
    address: '12 Market Street',
    amount: 1500,
    paymentMethod: 'UPI',
    status: 'CONFIRMED'
  });
  assert.equal(bookingRes.status, 201, 'Booking creation should succeed');
  const bookingId = bookingRes.body._id;

  const startTracking = await request(app)
    .post(`/api/bookings/${bookingId}/start-tracking`)
    .set('Authorization', `Bearer ${providerToken}`)
    .send();
  assert.equal(startTracking.status, 200, 'Provider should be able to start tracking');

  const locate = await request(app)
    .post(`/api/bookings/${bookingId}/location`)
    .set('Authorization', `Bearer ${providerToken}`)
    .send({ lat: 13.0827, lng: 80.2707 });
  assert.equal(locate.status, 200, 'Provider should be able to send tracking coordinates');

  const readLocation = await request(app)
    .get(`/api/bookings/${bookingId}/location`)
    .set('Authorization', `Bearer ${customerToken}`)
    .send();
  assert.equal(readLocation.status, 200, 'Customer should be able to read the tracking location');
  assert.ok(readLocation.body.location, 'Location payload should be present for an active booking');

  const providerPage = await request(app).get('/provider-dashboard.html');
  assert.equal(providerPage.status, 200, 'Provider dashboard page should load');
  const signupPage = await request(app).get('/provider-signup.html');
  assert.equal(signupPage.status, 200, 'Provider signup page should load');
  const homePage = await request(app).get('/');
  assert.equal(homePage.status, 200, 'Homepage should load');

  const providers = await request(app).get('/api/providers');
  assert.equal(providers.status, 200, 'Provider catalog should be available');

  console.log('Integration checks passed');
}

run().catch((error) => {
  console.error('Integration checks failed');
  console.error(error.stack || error.message || error);
  process.exit(1);
});
