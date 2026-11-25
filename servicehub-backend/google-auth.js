(function () {
  let firebaseModules;

  async function getFirebaseModules() {
    if (!firebaseModules) {
      firebaseModules = Promise.all([
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js')
      ]);
    }

    return firebaseModules;
  }

  async function requestJson(path, body) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Google sign-in failed.');
    }

    return data;
  }

  async function start(role, service) {
    const configResponse = await fetch('/api/config');
    const configData = await configResponse.json();
    if (!configResponse.ok || !configData.firebaseConfig) {
      throw new Error('Google sign-in is not configured yet. Please contact the site administrator.');
    }

    const [firebaseApp, firebaseAuth] = await getFirebaseModules();
    const app = firebaseApp.getApps().length
      ? firebaseApp.getApp()
      : firebaseApp.initializeApp(configData.firebaseConfig);
    const auth = firebaseAuth.getAuth(app);
    const provider = new firebaseAuth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await firebaseAuth.signInWithPopup(auth, provider);
    const idToken = await credential.user.getIdToken();

    return requestJson('/api/auth/google/start', { idToken, role, service });
  }

  function verify(challengeId, otp) {
    return requestJson('/api/auth/google/verify', { challengeId, otp });
  }

  window.googleOtpAuth = Object.freeze({ start, verify });
})();
