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
        const unsubProfile = onSnapshot(docRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setProfile({ id: docSnap.id, ...data });

            // RUN ONE-TIME DATABASE MIGRATION TO ADD accessLevel: 'admin' TO ALL EXISTING STAFF
            const STAFF_ROLES = ['admin', 'staff', 'veterinarian', 'groomer'];
            if (STAFF_ROLES.includes(data.role) && !window.rbacMigrationRun) {
              window.rbacMigrationRun = true;
              try {
                const { collection, getDocs, writeBatch } = await import('firebase/firestore');
                const usersSnap = await getDocs(collection(db, "users"));
                const batch = writeBatch(db);
                let migrationCount = 0;

                usersSnap.forEach((uDoc) => {
                  const uData = uDoc.data();
                  if (STAFF_ROLES.includes(uData.role) && !uData.rbac_migrated) {
                    batch.update(doc(db, "users", uDoc.id), {
                      accessLevel: 'admin',
                      rbac_migrated: true
                    });
                    migrationCount++;
                  }
                });

                if (migrationCount > 0) {
                  await batch.commit();
                  console.log(`[RBAC Migration] Successfully migrated ${migrationCount} staff profiles.`);
                }
              } catch (err) {
                console.error('[RBAC Migration] Failed:', err);
              }
            }
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

  // T4.154: All authenticated staff have full access — isAdmin is true for any staff profile.
  const STAFF_ROLES = ['admin', 'staff', 'veterinarian', 'groomer'];
  const isAdmin = !!profile && STAFF_ROLES.includes(profile.role || profile.accessLevel);

  // System admin controls Staff Management (creates, edits, revokes).
  // Fallback: Default legacy profiles without rbac_migrated to 'admin' (access level) to prevent lockout.
  const isSystemAdmin = !!profile && (
    profile.accessLevel === 'admin' ||
    profile.role === 'admin' ||
    !profile.rbac_migrated
  );

  return (
    <UserContext.Provider value={{ user, profile, isAdmin, isSystemAdmin, loading }}>
      {children}
    </UserContext.Provider>
  );
};

// THE FIX: This tells Vite not to crash when exporting a hook alongside a component!
// eslint-disable-next-line react-refresh/only-export-components
export const useUser = () => useContext(UserContext);