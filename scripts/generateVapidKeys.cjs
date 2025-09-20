const webpush = require('web-push');

function printHeader() {
  console.log('');
  console.log('============================================');
  console.log('           VAPID Key Generator');
  console.log('============================================');
}

function printFooter() {
  console.log('');
  console.log('Next steps:');
  console.log('1) Backend (Render): set env vars EXACTLY as:');
  console.log('   VAPID_PUBLIC_KEY  = above public key');
  console.log('   VAPID_PRIVATE_KEY = above private key');
  console.log('2) Frontend (Vercel): set env var EXACTLY as:');
  console.log('   VITE_VAPID_PUBLIC_KEY = above public key');
  console.log('3) Redeploy backend first, then frontend.');
  console.log('4) On devices: toggle push OFF then ON (re-subscribe), or reinstall PWA.');
  console.log('============================================');
  console.log('');
}

(function main() {
  printHeader();
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();

  console.log('--- Generated (URL-safe Base64) ---');
  console.log('');
  console.log('Backend .env snippet:');
  console.log(`VAPID_PUBLIC_KEY="${publicKey}"`);
  console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
  console.log('');
  console.log('Frontend .env snippet:');
  console.log(`VITE_VAPID_PUBLIC_KEY="${publicKey}"`);
  console.log('');
  console.log('NOTE: Keys must match exactly across backend and frontend.');
  printFooter();
})();
