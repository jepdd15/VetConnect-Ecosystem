const admin = require('firebase-admin');
const serviceAccount = require('./starbarks-vetconnect-f6443-firebase-adminsdk-h1h9k-264669888d.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function run() {
  const doc = await admin.firestore().doc('clinic_settings/llm_config').get();
  console.log(JSON.stringify(doc.data(), null, 2));
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
