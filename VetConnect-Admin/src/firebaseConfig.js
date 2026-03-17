// src/firebaseConfig.js
// The bridge to the database. Contains the API keys to establish the Web Socket connection to Firestore.

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";


const firebaseConfig = {

  apiKey: "AIzaSyCjcteCNm5DwVfic1hI2vzKOGowXi48zH0",

  authDomain: "starbarks-vetconnect.firebaseapp.com",

  projectId: "starbarks-vetconnect",

  storageBucket: "starbarks-vetconnect.firebasestorage.app",

  messagingSenderId: "491877746459",

  appId: "1:491877746459:web:71e9b3d1acb3762894f5be"

}; 

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the database and auth so we can use them in the website
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app); // <--- 2. EXPORT THIS