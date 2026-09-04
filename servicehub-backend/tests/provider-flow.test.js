const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const providerSignupHtml = fs.readFileSync(path.join(root, 'provider-signup.html'), 'utf8');
const providerDashboardHtml = fs.readFileSync(path.join(root, 'provider-dashboard.html'), 'utf8');
const providerDashboardPath = path.join(root, 'provider-dashboard.html');

assert.ok(indexHtml.includes("selectAccountRole('provider')"), 'Customer/provider role selector missing in home page');
assert.ok(indexHtml.includes("window.location.href = 'provider-signup.html'"), 'Provider button should route to the provider sign-up page');
assert.ok(indexHtml.includes("savedUser && savedUser.role === 'provider'"), 'Home page should detect an active provider on load and route automatically');
assert.ok(indexHtml.includes("userData.role === 'provider'"), 'Provider login should redirect directly to the dashboard after sign-in');
assert.ok(providerSignupHtml.includes("const res = await fetch(`${API_BASE}/auth/me`"), 'Provider signup page should validate saved token sessions');
assert.ok(providerSignupHtml.includes("if (data.user && data.user.role === 'provider')"), 'Provider signup page should auto-redirect known providers');
assert.ok(providerSignupHtml.includes("res.status === 409"), 'Provider signup should fall back to sign-in when the provider already exists');
assert.ok(providerSignupHtml.includes("toggleProviderAuthMode"), 'Provider page should support a sign-in mode for returning providers');
assert.ok(providerSignupHtml.includes("provider-signin-form"), 'Provider page should include a login form for repeat sign-ins');
assert.ok(providerSignupHtml.includes("window.location.href = 'provider-dashboard.html'"), 'Provider signup should route to the provider dashboard');
assert.ok(indexHtml.includes("payment-method"), 'User booking flow should include payment method selection');
assert.ok(indexHtml.includes("UPI"), 'User flow should offer a UPI payment option');
assert.ok(indexHtml.includes("Card"), 'User flow should offer card payment option');
assert.ok(providerDashboardHtml.includes("localStorage.getItem('currentUser')"), 'Provider dashboard should read the logged-in provider from local storage');
assert.ok(providerDashboardHtml.includes("Go to user page"), 'Provider dashboard should link back to the user page');
assert.ok(providerDashboardHtml.includes("index.html#services-page"), 'Provider dashboard should link to the user services area');
assert.ok(providerDashboardHtml.includes("index.html#ai-diagnose-page"), 'Provider dashboard should link to the user AI diagnostics area');
assert.ok(providerDashboardHtml.includes("index.html#groupbuy-page"), 'Provider dashboard should link to the user group deals area');
assert.ok(providerDashboardHtml.includes("index.html#user-dashboard-page"), 'Provider dashboard should link to the user bookings area');
assert.ok(indexHtml.includes("location.hash"), 'User pages should support hash-based deep-links to sections');
assert.ok(indexHtml.includes("settings-modal"), 'Signed-in user profile should have a settings modal');
assert.ok(indexHtml.includes("toggleProfileSettings"), 'Settings button should open the profile settings modal');
assert.ok(indexHtml.includes("id=\"nav-auth-btn\""), 'Sign-in button should exist on the user page');
assert.ok(indexHtml.includes("openAccountChoice()"), 'Sign-in button should trigger the account choice flow');
assert.ok(indexHtml.includes("proconnectActiveJob"), 'User page should sync a shared active booking state with the provider portal');
assert.ok(indexHtml.includes("PROVIDER_EN_ROUTE"), 'User page should expose the live provider status states');
assert.ok(indexHtml.includes("Confirm payment release"), 'Customer should be able to confirm escrow release with the shared OTP');
assert.ok(indexHtml.includes("/verify-otp"), 'Booking verification route should be invoked when escrow is confirmed');
assert.ok(providerDashboardHtml.includes("proconnectActiveJob"), 'Provider dashboard should read the shared active booking state');
assert.ok(providerDashboardHtml.includes("OTP release"), 'Provider console should show the OTP release completion flow');
assert.ok(fs.existsSync(providerDashboardPath), 'Provider dashboard page should exist');

console.log('Provider flow regression test passed');
