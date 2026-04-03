const admin = require('firebase-admin');
const serviceAccount = require('c:/Users/jepdd/Documents/VetConnect-Capstone/vetconnect-admin/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function findMarianne() {
    console.log('--- 🧬 FORENSIC SEARCH: MARIANNE ---');
    const snapshot = await db.collection('appointments')
        .where('petName', '==', 'marianne')
        .get();

    if (snapshot.empty) {
        console.log('No records found for petName: marianne');
        return;
    }

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const schedTime = data.scheduledDate ? data.scheduledDate.toDate().toLocaleString() : 'N/A';
        console.log(`ID: ${doc.id}`);
        console.log(`Status: ${data.status}`);
        console.log(`Scheduled: ${schedTime}`);
        console.log(`isTriaged: ${data.isTriaged}`);
        console.log(`TriageDate: ${data.triageDate}`);
        console.log(`Notes: ${data.notes?.substring(0, 50)}...`);
        console.log('-------------------');
    });
}

findMarianne().catch(console.error);
