// src/firebaseConfig.js
// The bridge to the database. Contains the API keys to establish the Web Socket connection to Firestore.

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";


export const firebaseConfig = {
  apiKey: "AIzaSyDRM1GnQYQkNgZjGPG-ssQh2inHHgDDsO4",
  authDomain: "starbarks-vetconnect-f6443.firebaseapp.com",
  projectId: "starbarks-vetconnect-f6443",
  storageBucket: "starbarks-vetconnect-f6443.firebasestorage.app",
  messagingSenderId: "156967516393",
  appId: "1:156967516393:web:da2f4bf88f0eba39cf5878"
}; 

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the database and auth so we can use them in the website
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app); // <--- 2. EXPORT THIS