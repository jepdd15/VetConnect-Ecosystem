import { initializeApp } from "firebase/app";
// CHANGE 1: Import specific React Native auth functions
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
// CHANGE 2: Import AsyncStorage
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

// Your existing config keys (Keep your own keys here!)
const firebaseConfig = {
  apiKey: "AIzaSyDRM1GnQYQkNgZjGPG-ssQh2inHHgDDsO4",
  authDomain: "starbarks-vetconnect-f6443.firebaseapp.com",
  projectId: "starbarks-vetconnect-f6443",
  storageBucket: "starbarks-vetconnect-f6443.firebasestorage.app",
  messagingSenderId: "156967516393",
  appId: "1:156967516393:web:da2f4bf88f0eba39cf5878",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// CHANGE 3: Initialize Auth with Persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});

export { auth, db };

