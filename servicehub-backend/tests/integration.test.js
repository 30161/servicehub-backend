const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');

async function run() {
  const customerPayload = {
    name: 'Alice Customer',
    email: 'alice.customer@example.com',
    password: 'securepass123',
    role: 'customer',
    service: 'Plumbing'
  };

  const providerPayload = {
    name: 'Bob Provider',
    email: 'bob.provider@example.com',
    password: 'securepass123',
    role: 'provider',
    service: 'Plumbing'
  };

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

  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200, 'Health endpoint should resolve');

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
