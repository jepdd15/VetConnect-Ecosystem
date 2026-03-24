// src/context/UserContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Firebase auth user
  const [profile, setProfile] = useState(null); // Firestore user profile with role
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (authUser) {
        // If user is logged in, listen to their profile for real-time role updates
        const docRef = doc(db, "users", authUser.uid);
        const unsubProfile = onSnapshot(docRef, (doc) => {
          if (doc.exists()) {
            setProfile({ id: doc.id, ...doc.data() });
          } else {
            setProfile(null);
          }
          setLoading(false);
        });
        return () => unsubProfile(); // Cleanup profile listener
      } else {
        // User logged out
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe(); // Cleanup auth listener
  }, []);

  const isAdmin = profile?.accessLevel === 'admin' || profile?.role === 'admin';

  return (
    <UserContext.Provider value={{ user, profile, isAdmin, loading }}>
      {children}
    </UserContext.Provider>
  );
};

// THE FIX: This tells Vite not to crash when exporting a hook alongside a component!
// eslint-disable-next-line react-refresh/only-export-components
export const useUser = () => useContext(UserContext);