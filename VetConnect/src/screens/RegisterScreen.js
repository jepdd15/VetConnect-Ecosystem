import { MaterialIcons } from "@expo/vector-icons";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../firebaseConfig";
import { COLORS } from '../theme/mobileTokens';
import { isValidPHPhone } from "../utils/phoneValidation";

const RegisterScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- NEW: Expanded registration fields ---
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [emergencyContacts, setEmergencyContacts] = useState([{ name: '', phone: '', relation: '' }]);
  const updateEC = (idx, field, val) => setEmergencyContacts(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));
  const addEC = () => setEmergencyContacts(prev => [...prev, { name: '', phone: '', relation: '' }]);
  const removeEC = (idx) => setEmergencyContacts(prev => prev.filter((_, i) => i !== idx));
  const [dpaConsent, setDpaConsent] = useState(false);
  const [waiverConsent, setWaiverConsent] = useState(false);
  const [allowPromos, setAllowPromos] = useState(false);
  const [preferredComm, setPreferredComm] = useState('SMS');

  // --- Referral source ---
  const [referral, setReferral] = useState({ source: '', referredBy: '' });
  const REFERRAL_SOURCES = ['Walk-by', 'Facebook', 'Google', 'Referral', 'Returning', 'Vet Referral', 'Other'];
  const REFERRAL_NEEDS_NAME = ['Referral', 'Vet Referral'];

  const handleReferralSourceChange = (src) => {
    setReferral(prev => ({
      source: prev.source === src ? '' : src,
      // Keep referredBy only when *selecting* (not deselecting) a needs-name source.
      // If the user taps the same chip to deselect it the resulting source is ''
      // so referredBy must be cleared regardless of which chip was tapped.
      referredBy: (prev.source !== src && REFERRAL_NEEDS_NAME.includes(src)) ? prev.referredBy : '',
    }));
  };

  // --- Active DPA + Waiver policies (fetched on mount) ---
  const [dpaPolicy, setDpaPolicy] = useState(null);
  const [waiverPolicy, setWaiverPolicy] = useState(null);
  const [dpaLoading, setDpaLoading] = useState(true);
  const [showFullPolicy, setShowFullPolicy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchDpaPolicy() {
      try {
        const policySnap = await getDoc(doc(db, 'clinic_settings', 'consent_policy'));
        if (!policySnap.exists() || !policySnap.data()?.activeVersion) {
          if (!cancelled) setDpaLoading(false);
          return;
        }
        const [dpaSnap, waiverSnap] = await Promise.all([
          getDocs(query(collection(db, 'consent_versions'), where('type', '==', 'dpa'), where('status', '==', 'active'), limit(1))),
          getDocs(query(collection(db, 'consent_versions'), where('type', '==', 'waiver'), where('status', '==', 'active'), limit(1))),
        ]);
        if (!dpaSnap.empty && !cancelled) {
          const d = dpaSnap.docs[0];
          setDpaPolicy({
            versionNumber: d.data().versionNumber,
            versionDocId:  d.id,
            title:         d.data().title,
            bodyText:      d.data().bodyText,
            summary:       d.data().summary ?? null,
          });
        }
        if (!waiverSnap.empty && !cancelled) {
          const w = waiverSnap.docs[0];
          setWaiverPolicy({
            versionNumber: w.data().versionNumber,
            versionDocId:  w.id,
            title:         w.data().title,
          });
        }
      } catch (err) {
        console.warn('[RegisterScreen] Failed to fetch consent policies:', err.message);
      } finally {
        if (!cancelled) setDpaLoading(false);
      }
    }
    fetchDpaPolicy();
    return () => { cancelled = true; };
  }, []);

  // DPA consent is now collected during registration via checkbox.
  // If the user consented (dpaPolicy existed and checkbox was checked),
  // their consentVersion matches activeVersion, so the ClientDashboard
  // consent gate (useConsentGate) will not fire.
  //
  // If no DPA policy is configured (dpaPolicy is null), the consent gate
  // also won't fire (it checks for activeVersion existence).
  //
  // Re-consent for version updates is handled by useConsentGate on
  // ClientDashboard, not here.
  const navigateAfterRegistration = () => {
    navigation.replace('ClientDashboard');
  };

  const handleRegister = async () => {
    // --- Basic required fields ---
    if (!fullName.trim() || !email.trim() || !password || !phone.trim()) {
      Alert.alert('Missing Info', 'Please fill in all required fields.');
      return;
    }

    if (!address.trim() || !city.trim()) {
      Alert.alert('Missing Info', 'Please provide your address and city.');
      return;
    }

    if (!emergencyContacts[0]?.name?.trim() || !emergencyContacts[0]?.phone?.trim()) {
      Alert.alert('Missing Info', 'Please provide at least one emergency contact name and phone number.');
      return;
    }

    // --- Phone validations ---
    if (!isValidPHPhone(phone)) {
      Alert.alert(
        'Invalid Number',
        'Mobile number must be a valid Philippine number starting with 09 (e.g., 09123456789).',
      );
      return;
    }

    for (let i = 0; i < emergencyContacts.length; i++) {
      const cp = emergencyContacts[i].phone?.trim() || '';
      if (i === 0 && !isValidPHPhone(cp)) {
        Alert.alert('Invalid Number', 'Primary emergency contact phone must be a valid Philippine number (09XXXXXXXXX).');
        return;
      }
      if (i > 0 && cp && !isValidPHPhone(cp)) {
        Alert.alert('Invalid Number', `Emergency contact #${i + 1} phone must be a valid Philippine number (09XXXXXXXXX).`);
        return;
      }
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }

    // --- DPA consent required when policy exists ---
    if (dpaPolicy && !dpaConsent) {
      Alert.alert('Consent Required', 'Please agree to the Data Privacy Policy to create your account.');
      return;
    }
    if (waiverPolicy && !waiverConsent) {
      Alert.alert('Consent Required', 'Please agree to the Liability Waiver to create your account.');
      return;
    }

    setLoading(true);
    Keyboard.dismiss();

    try {

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      const uid = userCredential.user.uid;


      // ====================================================================
      // 🤖 THE THICK-CLIENT RECONCILIATION ENGINE
      // ====================================================================
      try {

        const guestQuery = query(
          collection(db, "users"),
          where("phone", "==", phone.trim()),
          where("accountStatus", "==", "unclaimed_guest"),
        );
        const guestSnap = await getDocs(guestQuery);


        if (!guestSnap.empty) {
          const guestDoc = guestSnap.docs[0];
          const guestId = guestDoc.id;
          const batch = writeBatch(db);

          const guestData = guestDoc.data();
          const newUserRef = doc(db, "users", uid);
          const now = Timestamp.now();
          batch.set(newUserRef, {
            ...guestData,
            uid: uid,
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            address: address.trim(),
            city: city.trim(),
            emergencyContacts: emergencyContacts.filter((c, i) => i === 0 || c.name?.trim() || c.phone?.trim()),
            emergencyName: emergencyContacts[0]?.name?.trim() || '',
            emergencyPhone: emergencyContacts[0]?.phone?.trim() || '',
            role: "pet_owner",
            accountStatus: "claimed",
            profileComplete: true,
            mergedFromGuest: true,
            allowPromos,
            preferredComm: allowPromos ? preferredComm : 'SMS',
            referral: { source: referral.source || null, referredBy: referral.referredBy || null },
            referralSource: referral.source || null,
            referredBy: referral.referredBy || null,
            ...(dpaPolicy ? {
              consentVersion: dpaPolicy.versionNumber,
              consentGrantedAt: now,
              dpaConsent: true,
            } : {}),
            ...(waiverPolicy ? {
              waiverVersion: waiverPolicy.versionNumber,
              waiverGrantedAt: now,
              waiverSigned: true,
            } : {}),
            createdAt: guestData.createdAt || now,
          });

          batch.delete(doc(db, "users", guestId));

          const petsSnap = await getDocs(
            query(collection(db, "pets"), where("ownerId", "==", guestId)),
          );
          petsSnap.forEach((p) => {
            batch.update(doc(db, "pets", p.id), { ownerId: uid });
          });

          // T2.419: Migrate medical_records so ownerId-based queries
          // (e.g. ClientDashboard health reminders) work after merge.
          const medRecSnap = await getDocs(
            query(
              collection(db, "medical_records"),
              where("ownerId", "==", guestId),
            ),
          );
          medRecSnap.forEach((r) => {
            batch.update(doc(db, "medical_records", r.id), { ownerId: uid });
          });

          const apptSnap = await getDocs(
            query(
              collection(db, "appointments"),
              where("ownerId", "==", guestId),
            ),
          );
          apptSnap.forEach((a) => {
            batch.update(doc(db, "appointments", a.id), { ownerId: uid });
          });

          await batch.commit();

          // Write consent_records audit entry for guest merge path (outside batch
          // to preserve the Auth rollback pattern — a consent_records failure
          // after a successful user doc write is an audit gap, not a user blocker)
          if (dpaPolicy) {
            await setDoc(doc(collection(db, 'users', uid, 'consent_records')), {
              consentType: 'dpa',
              versionNumber: dpaPolicy.versionNumber,
              versionDocId: dpaPolicy.versionDocId,
              action: 'granted',
              signatureType: 'checkbox',
              signatureData: null,
              grantedAt: now,
              grantedVia: 'registration',
              deviceInfo: 'mobile',
              adminNote: null,
            });
          }
          if (waiverPolicy) {
            await setDoc(doc(collection(db, 'users', uid, 'consent_records')), {
              consentType: 'waiver',
              versionNumber: waiverPolicy.versionNumber,
              versionDocId: waiverPolicy.versionDocId,
              action: 'granted',
              signatureType: 'checkbox',
              signatureData: null,
              grantedAt: now,
              grantedVia: 'registration',
              deviceInfo: 'mobile',
              adminNote: null,
            });
          }

          console.log("Account successfully merged from walk-in guest!");
        } else {
          // STANDARD REGISTRATION
          const now = Timestamp.now();


          await setDoc(doc(db, "users", uid), {
            uid: uid,
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            address: address.trim(),
            city: city.trim(),
            emergencyContacts: emergencyContacts.filter((c, i) => i === 0 || c.name?.trim() || c.phone?.trim()),
            emergencyName: emergencyContacts[0]?.name?.trim() || '',
            emergencyPhone: emergencyContacts[0]?.phone?.trim() || '',
            role: "pet_owner",
            accountStatus: "active",
            profileComplete: true,
            allowPromos,
            preferredComm: allowPromos ? preferredComm : 'SMS',
            referral: { source: referral.source || null, referredBy: referral.referredBy || null },
            referralSource: referral.source || null,
            referredBy: referral.referredBy || null,
            ...(dpaPolicy ? {
              consentVersion: dpaPolicy.versionNumber,
              consentGrantedAt: now,
              dpaConsent: true,
            } : {}),
            ...(waiverPolicy ? {
              waiverVersion: waiverPolicy.versionNumber,
              waiverGrantedAt: now,
              waiverSigned: true,
            } : {}),
            createdAt: now,
          });


          // Write consent_records audit entries — separate from the user doc write
          // to preserve the existing Auth rollback pattern
          if (dpaPolicy) {
            const consentRecordRef = doc(
              collection(db, 'users', uid, 'consent_records'),
            );
            await setDoc(consentRecordRef, {
              consentType: 'dpa',
              versionNumber: dpaPolicy.versionNumber,
              versionDocId: dpaPolicy.versionDocId,
              action: 'granted',
              signatureType: 'checkbox',
              signatureData: null,
              grantedAt: now,
              grantedVia: 'registration',
              deviceInfo: 'mobile',
              adminNote: null,
            });
          }
          if (waiverPolicy) {
            await setDoc(doc(collection(db, 'users', uid, 'consent_records')), {
              consentType: 'waiver',
              versionNumber: waiverPolicy.versionNumber,
              versionDocId: waiverPolicy.versionDocId,
              action: 'granted',
              signatureType: 'checkbox',
              signatureData: null,
              grantedAt: now,
              grantedVia: 'registration',
              deviceInfo: 'mobile',
              adminNote: null,
            });
          }
        }
      } catch (firestoreError) {
        // Auth account exists but Firestore profile failed — roll back Auth
        // to prevent the user from being permanently stuck.
        console.error("Firestore write failed, rolling back Auth account:", firestoreError);
        try {
          await deleteUser(userCredential.user);
        } catch (deleteError) {
          // If rollback also fails, log it. The user will see the registration
          // failure alert and can contact support. This is a rare double-fault.
          console.error("Auth rollback also failed:", deleteError);
        }
        throw firestoreError;
      }

      Alert.alert("Welcome!", "Your account has been created successfully.");
      navigateAfterRegistration();
    } catch (error) {
      let errorMessage = error.message;
      if (error.code === "auth/email-already-in-use")
        errorMessage = "This email is already registered. Please log in.";
      else if (error.code === "auth/invalid-email")
        errorMessage = "Please enter a valid email address.";
      Alert.alert("Registration Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={{
            ...styles.scrollContent,
            paddingBottom: insets.bottom > 0 ? insets.bottom + 60 : 70,
          }}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <MaterialIcons name="arrow-back" size={24} color="#3E2723" />
          </TouchableOpacity>

          <View style={styles.headerBox}>
            <Text style={styles.header}>CREATE ACCOUNT</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.formShadow} />
            <View style={styles.formBox}>
              <View style={styles.logoWrap}>
                <Image
                  source={require('../../assets/images/starbarks_logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              {/* ====== SECTION: ACCOUNT ====== */}
              <Text style={styles.sectionLabel}>ACCOUNT</Text>

              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Juan Dela Cruz"
                placeholderTextColor="#999"
                value={fullName}
                onChangeText={setFullName}
              />

              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="09xxxxxxxxx"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                maxLength={11}
                value={phone}
                onChangeText={setPhone}
              />

              <Text style={styles.label}>Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="juan@example.com"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />

              <Text style={styles.label}>Password *</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Min. 6 characters"
                  placeholderTextColor="#999"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <MaterialIcons
                    name={showPassword ? "visibility" : "visibility-off"}
                    size={22}
                    color="#3ABEF9"
                  />
                </TouchableOpacity>
              </View>

              {/* ====== SECTION: CONTACT & ADDRESS ====== */}
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionLabel}>CONTACT & ADDRESS</Text>

              <Text style={styles.label}>Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 123 Main St, Brgy. Poblacion"
                placeholderTextColor="#999"
                value={address}
                onChangeText={setAddress}
              />

              <Text style={styles.label}>City / Municipality *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Dagupan City"
                placeholderTextColor="#999"
                value={city}
                onChangeText={setCity}
              />

              {/* ====== SECTION: EMERGENCY CONTACTS ====== */}
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionLabel}>EMERGENCY CONTACTS</Text>

              {emergencyContacts.map((ec, idx) => (
                <View key={idx} style={{ marginBottom: idx < emergencyContacts.length - 1 ? 12 : 0 }}>
                  {idx > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={[styles.label, { marginBottom: 0, color: COLORS.textMuted }]}>Contact #{idx + 1}</Text>
                      <TouchableOpacity onPress={() => removeEC(idx)}>
                        <Text style={{ color: COLORS.danger, fontWeight: '900', fontSize: 12 }}>REMOVE</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <Text style={styles.label}>{idx === 0 ? 'Contact Name *' : 'Contact Name'}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Maria Clara"
                    placeholderTextColor="#999"
                    value={ec.name}
                    onChangeText={(v) => updateEC(idx, 'name', v)}
                  />
                  <View style={styles.emergencyRow}>
                    <View style={styles.emergencyCol}>
                      <Text style={styles.label}>{idx === 0 ? 'Phone *' : 'Phone'}</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="09xxxxxxxxx"
                        placeholderTextColor="#999"
                        keyboardType="phone-pad"
                        maxLength={11}
                        value={ec.phone}
                        onChangeText={(v) => updateEC(idx, 'phone', v)}
                      />
                    </View>
                    <View style={styles.emergencyCol}>
                      <Text style={styles.label}>Relation</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                        {['Spouse', 'Parent', 'Sibling', 'Child', 'Relative', 'Friend', 'Caretaker', 'Other'].map(r => (
                          <TouchableOpacity key={r} onPress={() => updateEC(idx, 'relation', r)}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5,
                              borderColor: ec.relation === r ? COLORS.sky : '#ccc',
                              backgroundColor: ec.relation === r ? COLORS.sky + '15' : '#fff' }}>
                            <Text style={{ fontSize: 11, fontWeight: ec.relation === r ? '900' : '600',
                              color: ec.relation === r ? COLORS.sky : '#666' }}>{r}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={addEC} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                <Text style={{ color: COLORS.sky, fontWeight: '900', fontSize: 13, letterSpacing: 0.5 }}>+ ADD ANOTHER CONTACT</Text>
              </TouchableOpacity>

              {/* ====== SECTION: HOW DID YOU HEAR ABOUT US ====== */}
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionLabel}>HOW DID YOU HEAR ABOUT US?</Text>
              <Text style={styles.label}>Source (Optional)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {REFERRAL_SOURCES.map(src => (
                  <TouchableOpacity
                    key={src}
                    onPress={() => handleReferralSourceChange(src)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5,
                      borderColor: referral.source === src ? COLORS.sky : '#ccc',
                      backgroundColor: referral.source === src ? COLORS.sky + '15' : '#fff',
                    }}
                  >
                    <Text style={{
                      fontSize: 12, fontWeight: referral.source === src ? '900' : '600',
                      color: referral.source === src ? COLORS.sky : '#666',
                    }}>{src}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {REFERRAL_NEEDS_NAME.includes(referral.source) && (
                <>
                  <Text style={styles.label}>Referred by</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Name of referring client or vet"
                    placeholderTextColor="#999"
                    value={referral.referredBy}
                    onChangeText={(v) => setReferral(prev => ({ ...prev, referredBy: v }))}
                  />
                </>
              )}

              {/* ====== SECTION: LEGAL ====== */}
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionLabel}>LEGAL</Text>

              {/* DPA Consent Checkbox */}
              {dpaLoading ? (
                <ActivityIndicator size="small" color="#3ABEF9" style={{ marginVertical: 10 }} />
              ) : dpaPolicy ? (
                <View>
                  <Text style={styles.policyTitle}>{dpaPolicy.title}</Text>
                  <Text style={styles.policyPreview}>
                    {showFullPolicy
                      ? dpaPolicy.bodyText
                      : (dpaPolicy.summary || (dpaPolicy.bodyText || '').substring(0, 200) + '...')}
                  </Text>
                  <TouchableOpacity onPress={() => setShowFullPolicy(!showFullPolicy)}>
                    <Text style={styles.viewPolicyLink}>
                      {showFullPolicy ? 'HIDE FULL POLICY' : 'VIEW FULL POLICY'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setDpaConsent(!dpaConsent)}
                  >
                    <MaterialIcons
                      name={dpaConsent ? 'check-box' : 'check-box-outline-blank'}
                      size={24}
                      color={dpaConsent ? '#3ABEF9' : '#999'}
                    />
                    <Text style={styles.checkboxText}>
                      I have read and agree to the Data Privacy Policy *
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.policyNote}>
                  Data Privacy Policy not yet configured. You can proceed without consent.
                </Text>
              )}

              {/* Liability Waiver Checkbox */}
              {waiverPolicy && (
                <TouchableOpacity
                  style={[styles.checkboxRow, { marginTop: 10 }]}
                  onPress={() => setWaiverConsent(!waiverConsent)}
                >
                  <MaterialIcons
                    name={waiverConsent ? 'check-box' : 'check-box-outline-blank'}
                    size={24}
                    color={waiverConsent ? '#3ABEF9' : '#999'}
                  />
                  <Text style={styles.checkboxText}>
                    I have read and agree to the Liability Waiver *
                  </Text>
                </TouchableOpacity>
              )}

              {/* Promo Opt-In Checkbox */}
              <TouchableOpacity
                style={[styles.checkboxRow, { marginTop: 10 }]}
                onPress={() => setAllowPromos(!allowPromos)}
              >
                <MaterialIcons
                  name={allowPromos ? 'check-box' : 'check-box-outline-blank'}
                  size={24}
                  color={allowPromos ? '#3ABEF9' : '#999'}
                />
                <Text style={styles.checkboxText}>
                  I agree to receive SMS or Emails regarding clinic promos and announcements.
                </Text>
              </TouchableOpacity>
              {allowPromos && (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, marginLeft: 28 }}>
                  {['SMS', 'Email'].map(ch => (
                    <TouchableOpacity key={ch} onPress={() => setPreferredComm(ch)}
                      style={{ paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1.5,
                        borderColor: preferredComm === ch ? COLORS.sky : '#ccc',
                        backgroundColor: preferredComm === ch ? COLORS.sky + '15' : '#fff' }}>
                      <Text style={{ fontSize: 12, fontWeight: preferredComm === ch ? '900' : '600',
                        color: preferredComm === ch ? COLORS.sky : '#666' }}>
                        {ch}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={{ fontSize: 11, color: '#999', alignSelf: 'center', marginLeft: 4 }}>Preferred</Text>
                </View>
              )}

              {/* ====== SIGN UP BUTTON ====== */}
              {loading ? (
                <ActivityIndicator
                  size="large"
                  color="#3ABEF9"
                  style={{ marginVertical: 20 }}
                />
              ) : (
                <View style={styles.buttonContainer}>
                  <View style={styles.buttonShadow} />
                  <Pressable
                    onPress={handleRegister}
                    style={({ pressed }) => [
                      styles.button,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.buttonText}>SIGN UP</Text>
                  </Pressable>
                </View>
              )}

              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={{ marginTop: 15, padding: 10 }}
              >
                <Text style={styles.linkText}>
                  ALREADY HAVE AN ACCOUNT?{" "}
                  <Text style={styles.linkBold}>LOGIN</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const SCREEN_WIDTH = Dimensions.get('window').width;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8E1" },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 80,
  },

  backButton: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 45,
    height: 45,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#3E2723",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },

  headerBox: { alignItems: "flex-start", marginBottom: 20 },
  header: {
    fontFamily: "Inter_900Black",
    fontSize: Math.min(48, SCREEN_WIDTH * 0.115),
    color: "#3E2723",
    textTransform: "uppercase",
    letterSpacing: -1,
    lineHeight: Math.min(48, SCREEN_WIDTH * 0.115),
  },
  subHeader: {
    fontSize: 14,
    color: "#5D4037",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  formContainer: { position: "relative", marginBottom: 20 },
  formShadow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: -8,
    bottom: -8,
    backgroundColor: "#5D4037",
  },
  formBox: {
    backgroundColor: "white",
    padding: 25,
    borderRadius: 0,
    borderWidth: 3,
    borderColor: "#3E2723",
  },

  logoWrap: { alignItems: "center", marginBottom: 18 },
  logo: { width: 80, height: 80 },

  label: {
    fontWeight: "900",
    color: "#3E2723",
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  input: {
    fontFamily: "Inter_400Regular",
    backgroundColor: "white",
    borderRadius: 0,
    padding: 16,
    fontSize: 16,
    marginBottom: 15,
    color: "#333",
    borderWidth: 2,
    borderColor: "#3E2723",
  },

  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 0,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: "#3E2723",
  },
  passwordInput: { flex: 1, padding: 16, fontSize: 16, color: "#333" },
  eyeIcon: { padding: 15 },

  buttonContainer: { position: "relative", marginBottom: 10, marginTop: 5 },
  buttonShadow: {
    position: "absolute",
    top: 6,
    left: 6,
    right: 0,
    bottom: 0,
    backgroundColor: "#3E2723",
  },
  button: {
    backgroundColor: "#3ABEF9",
    padding: 18,
    borderRadius: 0,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#3E2723",
  },
  buttonPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  buttonText: {
    color: "#3E2723",
    fontWeight: "900",
    fontSize: 20,
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  linkText: {
    color: "#3E2723",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  linkBold: {
    fontFamily: "Inter_900Black",
    color: "#3ABEF9",
    textDecorationLine: "underline",
  },

  // --- NEW: Section & Legal styles ---
  sectionLabel: {
    fontWeight: '900',
    color: '#5D4037',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
    marginTop: 5,
  },
  sectionDivider: {
    height: 2,
    backgroundColor: '#E0E0E0',
    marginVertical: 18,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
  },
  checkboxText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    color: '#3E2723',
    fontWeight: '700',
    lineHeight: 20,
  },
  policyTitle: {
    fontWeight: '900',
    fontSize: 14,
    color: '#3E2723',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  policyPreview: {
    fontSize: 12,
    color: '#5D4037',
    lineHeight: 18,
    marginBottom: 8,
  },
  viewPolicyLink: {
    fontSize: 12,
    color: '#3ABEF9',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textDecorationLine: 'underline',
    marginBottom: 12,
  },
  policyNote: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  emergencyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  emergencyCol: {
    flex: 1,
  },
});

export default RegisterScreen;
