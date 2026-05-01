import { MaterialIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { COLORS } from '../theme/mobileTokens';
import { isValidPHPhone } from "../utils/phoneValidation";

// THE FIX: Notice we added `route` to the props to catch the secret flag!
export default function UserProfileScreen({ navigation, route }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isErased, setIsErased] = useState(false);

  // Catch the flag from BookAppointment.js
  const isBookingRedirect = route.params?.isBookingRedirect || false;

  // --- FORM STATES ---
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [secondaryPhone, setSecondaryPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [dob, setDob] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [seniorId, setSeniorId] = useState("");
  const [govIdType, setGovIdType] = useState("");
  const [govIdNumber, setGovIdNumber] = useState("");

  // THE FIX: Emergency Contacts is now an Array!
  const [emergencyContacts, setEmergencyContacts] = useState([
    { name: "", phone: "", relation: "" },
  ]);

  // Legacy boolean kept for backward compatibility with handleUpdate payload
  const [dpaConsent, setDpaConsent] = useState(false);
  // Versioned consent fields — the new source of truth
  const [consentVersion, setConsentVersion] = useState(null);
  const [consentGrantedAt, setConsentGrantedAt] = useState(null);
  const [waiverVersion, setWaiverVersion] = useState(null);
  const [waiverGrantedAt, setWaiverGrantedAt] = useState(null);
  const [allowPromos, setAllowPromos] = useState(false);
  const [gender, setGender] = useState("Decline");
  const [referralSource, setReferralSource] = useState("");
  const [preferredComm, setPreferredComm] = useState("SMS");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [waiverSigned, setWaiverSigned] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});

  useEffect(() => {
    const fetchProfile = async () => {
      if (!auth.currentUser) {
        setLoading(false);
        return;
      }
      try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data();

          // RA 10173 Step 4.1: Guard — erased accounts show a read-only notice.
          // The Firebase Auth account may still exist on the Spark plan, so this
          // prevents interaction with a profile whose PII has been anonymized.
          if (data.accountStatus === 'erased') {
            setIsErased(true);
            return;
          }

          setFullName(data.fullName || "");
          setPhone(data.phone || "");
          setEmail(data.email || auth.currentUser?.email || "");
          setSecondaryPhone(data.secondaryPhone || "");
          setAddress(data.address || "");
          setCity(data.city || "");
          setGender(data.gender || "Decline");
          setSeniorId(data.seniorId || "");
          setGovIdType(data.govIdType || "");
          setGovIdNumber(data.govIdNumber || "");
          setAllowPromos(data.allowPromos || false);
          setDpaConsent(data.dpaConsent || false);
          // Versioned consent fields
          setConsentVersion(data.consentVersion ?? null);
          setConsentGrantedAt(data.consentGrantedAt ?? null);
          setWaiverVersion(data.waiverVersion ?? null);
          setWaiverGrantedAt(data.waiverGrantedAt ?? null);
          setReferralSource(data.referralSource || "");
          setPreferredComm(data.preferredComm || "SMS");
          setWhatsappOptIn(data.whatsappOptIn || false);
          setWaiverSigned(data.waiverSigned || false);

          // Load dynamic contacts or fallback to old structure
          if (data.emergencyContacts && data.emergencyContacts.length > 0) {
            setEmergencyContacts(data.emergencyContacts);
          } else if (data.emergencyName) {
            setEmergencyContacts([
              {
                name: data.emergencyName,
                phone: data.emergencyPhone || "",
                relation: "Primary",
              },
            ]);
          }

          if (data.dob && typeof data.dob.toDate === "function") {
            setDob(data.dob.toDate());
          }
        }
      } catch (error) {
        console.error("Profile Fetch Error:", error);
        Alert.alert("Error", "Could not load profile data.");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  // Re-fetch waiver state when the user navigates back from ConsentScreen.
  // The profile fetch above runs once on mount; this ensures waiverVersion and
  // waiverGrantedAt reflect any signature the user just completed.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      if (!auth.currentUser) return;
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setWaiverVersion(data.waiverVersion ?? null);
          setWaiverGrantedAt(data.waiverGrantedAt ?? null);
          // Also refresh DPA fields in case the user signed both on the same return
          setConsentVersion(data.consentVersion ?? null);
          setConsentGrantedAt(data.consentGrantedAt ?? null);
        }
      } catch (err) {
        console.warn('[UserProfileScreen] Focus refresh error:', err.message);
      }
    });
    return unsubscribe;
  }, [navigation]);

  const navigateToWaiverScreen = async () => {
    try {
      const waiverQ = query(
        collection(db, 'consent_versions'),
        where('type', '==', 'waiver'),
        where('status', '==', 'active'),
        limit(1),
      );
      const waiverSnap = await getDocs(waiverQ);
      if (waiverSnap.empty) {
        Alert.alert('Not Available', 'No liability waiver policy is currently configured.');
        return;
      }
      const d = waiverSnap.docs[0];
      navigation.navigate('Consent', {
        consentType:        'waiver',
        versionNumber:      d.data().versionNumber,
        versionDocId:       d.id,
        policyText:         d.data().bodyText,
        policyTitle:        d.data().title,
        isPostRegistration: false,
        previousVersion:    waiverVersion,
        summary:            d.data().summary ?? null,
      });
    } catch (err) {
      console.warn('[UserProfileScreen] Failed to load waiver policy:', err.message);
      Alert.alert('Error', 'Could not load waiver policy. Please check your connection and try again.');
    }
  };

  async function navigateToConsentScreen() {
    try {
      const policySnap = await getDoc(doc(db, 'clinic_settings', 'consent_policy'));
      if (!policySnap.exists() || !policySnap.data()?.activeVersion) {
        return false;
      }
      const dpaQ = query(
        collection(db, 'consent_versions'),
        where('type', '==', 'dpa'),
        where('status', '==', 'active'),
        limit(1),
      );
      const dpaSnap = await getDocs(dpaQ);
      if (dpaSnap.empty) return false;
      const d = dpaSnap.docs[0];
      navigation.navigate('Consent', {
        consentType:        'dpa',
        versionNumber:      d.data().versionNumber,
        versionDocId:       d.id,
        policyText:         d.data().bodyText,
        policyTitle:        d.data().title,
        isPostRegistration: false,
        previousVersion:    consentVersion,
        summary:            d.data().summary ?? null,
      });
      return true;
    } catch {
      return false;
    }
  }

  const handleUpdate = async () => {
    // 1. Basic empty check
    if (
      !fullName.trim() ||
      !phone.trim() ||
      !address.trim() ||
      !city.trim() ||
      !emergencyContacts[0].name.trim() ||
      !emergencyContacts[0].phone.trim()
    ) {
      Alert.alert("Incomplete", "Please fill in all required fields (*).");
      return;
    }

    // 2. PH Phone Validation Check
    if (!isValidPHPhone(phone)) {
      Alert.alert(
        "Invalid Number",
        "Your mobile number must be a valid Philippine number starting with 09 (e.g., 09123456789).",
      );
      return;
    }

    // T2.498: Validate secondary phone only if non-empty
    if (secondaryPhone.trim() && !isValidPHPhone(secondaryPhone)) {
      Alert.alert(
        "Invalid Number",
        "Your secondary phone must be a valid Philippine number starting with 09 (e.g., 09123456789).",
      );
      return;
    }

    // Validate all emergency contact phones too
    for (let i = 0; i < emergencyContacts.length; i++) {
      const contactPhone = emergencyContacts[i].phone?.trim() || "";
      // T2.364: Only validate phone for required primary (index 0) or non-empty optional contacts
      if (i === 0 && !isValidPHPhone(contactPhone)) {
        Alert.alert(
          "Invalid Number",
          `Emergency Contact #${i + 1} has an invalid phone number. It must start with 09 and be 11 digits long.`,
        );
        return;
      }
      if (i > 0 && contactPhone !== "" && !isValidPHPhone(contactPhone)) {
        Alert.alert(
          "Invalid Number",
          `Emergency Contact #${i + 1} has an invalid phone number. It must start with 09 and be 11 digits long.`,
        );
        return;
      }
    }

    // 3. Legal Check — use consentVersion (authoritative) with dpaConsent boolean as fallback.
    // If neither is present, navigate to ConsentScreen with live policy data.
    const hasValidConsent = consentVersion != null || dpaConsent;
    if (!hasValidConsent) {
      const navigated = await navigateToConsentScreen();
      if (!navigated) {
        Alert.alert('Consent Required', 'Please provide Data Privacy Act consent before saving your profile.');
      }
      return;
    }

    setSaving(true);
    Keyboard.dismiss();

    const cleanedContacts = emergencyContacts.filter(
      (c, i) => i === 0 || (c.name?.trim() || c.phone?.trim()),
    );

    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      const payload = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        secondaryPhone: secondaryPhone.trim() || null,
        email: email.trim().toLowerCase(),
        address: address.trim(),
        city: city.trim(),
        gender,
        seniorId: seniorId.trim(),
        govIdType: govIdType || null,
        govIdNumber: govIdNumber.trim() || null,
        emergencyContacts: cleanedContacts,
        emergencyName: cleanedContacts[0]?.name?.trim() || "",
        emergencyPhone: cleanedContacts[0]?.phone?.trim() || "",
        // Derive the legacy boolean from the authoritative versioned field.
        // This keeps backward-compat code (admin portal, BookAppointment) accurate.
        dpaConsent: consentVersion != null ? true : dpaConsent,
        allowPromos,
        referralSource: allowPromos ? (referralSource || null) : null,
        preferredComm: allowPromos ? preferredComm : "SMS",
        whatsappOptIn: allowPromos ? whatsappOptIn : false,
        waiverSigned: waiverVersion != null ? true : waiverSigned,
        profileComplete: true,
      };

      payload.dob = dob ? Timestamp.fromDate(dob) : null;

      await updateDoc(userRef, payload);

      Alert.alert("Success", "Your profile has been securely updated!");

      // If they came from booking, send them back!
      if (isBookingRedirect) {
        navigation.goBack();
      } else {
        navigation.navigate("ClientDashboard");
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setSaving(false);
    }
  };

  const updateEmergencyContact = (index, field, value) => {
    const newContacts = [...emergencyContacts];
    newContacts[index][field] = value;
    setEmergencyContacts(newContacts);
  };

  const addEmergencyContact = () => {
    setEmergencyContacts([
      ...emergencyContacts,
      { name: "", phone: "", relation: "" },
    ]);
  };

  const removeEmergencyContact = (index) => {
    if (emergencyContacts.length === 1) return; // Always keep at least 1
    const newContacts = [...emergencyContacts];
    newContacts.splice(index, 1);
    setEmergencyContacts(newContacts);
  };

  const toggleSection = (key) => {
    Keyboard.dismiss();
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  /**
   * Formats a Firestore Timestamp or ISO date string into a human-readable date.
   * Returns null if the value is missing or unparseable.
   */
  const formatConsentDate = (timestampOrString) => {
    if (!timestampOrString) return null;
    try {
      const date =
        typeof timestampOrString.toDate === 'function'
          ? timestampOrString.toDate()
          : new Date(timestampOrString);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  // --- THE UX FIX: Dynamic Highlighting Style ---
  const getHighlightStyle = (val) => {
    return isBookingRedirect && !(val || "").trim() ? styles.missingFieldHighlight : {};
  };

  // ---------------------------------------------------------------------------
  // Consent Withdrawal — Phase 6.1 (T3.5)
  // ---------------------------------------------------------------------------

  /**
   * Writes the withdrawal consent_record and marks the user for erasure.
   * Called only after the user has confirmed through both Alert dialogs.
   */
  const executeWithdrawal = async () => {
    if (!auth.currentUser) return;

    const uid = auth.currentUser.uid;
    const userRef = doc(db, 'users', uid);
    const consentRecordsRef = collection(db, 'users', uid, 'consent_records');

    try {
      const batch = writeBatch(db);

      // Write the withdrawal consent record
      const withdrawalRecordRef = doc(consentRecordsRef);
      batch.set(withdrawalRecordRef, {
        consentType: 'dpa',
        versionNumber: consentVersion,
        versionDocId: null,
        action: 'withdrawn',
        signatureType: null,
        signatureData: null,
        grantedAt: Timestamp.now(),
        grantedVia: 'mobile_app',
        deviceInfo: 'mobile',
        adminNote: null,
      });

      // Mark the user doc: clear consent fields, flag for erasure
      batch.update(userRef, {
        consentVersion: null,
        consentGrantedAt: null,
        dpaConsent: false,
        deletionRequested: true,
        deletionRequestedAt: Timestamp.now(),
      });

      await batch.commit();

      // Update local state so the UI reflects the withdrawal immediately
      setConsentVersion(null);
      setConsentGrantedAt(null);
      setDpaConsent(false);

      Alert.alert(
        'Consent Withdrawn',
        'Your consent has been withdrawn. The clinic will process your data erasure request within 30 days as required by RA 10173.',
      );
    } catch (err) {
      console.error('[UserProfileScreen.executeWithdrawal]:', err.message);
      Alert.alert('Error', 'Could not process withdrawal. Please try again or contact the clinic directly.');
    }
  };

  /**
   * Triggers the two-step Alert confirmation sequence before executing
   * consent withdrawal.  Two explicit confirmations prevent accidental taps.
   */
  const handleWithdrawConsent = () => {
    Alert.alert(
      'Withdraw Consent',
      'Withdrawing consent means we can no longer process your personal data. This will result in your account being scheduled for erasure under RA 10173.\n\nAre you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I Understand, Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'This action is irreversible. All your personal data, pet names, and appointment history will be anonymized. Medical records will be retained for clinical audit with identifying information removed.\n\nProceed?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Withdraw My Consent',
                  style: 'destructive',
                  onPress: executeWithdrawal,
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Request Account Deletion",
      "This will submit a deletion request to the clinic. Your account will be deactivated and scheduled for removal within 30 days per the Data Privacy Act (RA 10173).\n\nAll associated pet profiles and medical records will be preserved for clinical audit purposes.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit Request",
          style: "destructive",
          onPress: async () => {
            if (!auth.currentUser) return;
            try {
              const userRef = doc(db, "users", auth.currentUser.uid);
              await updateDoc(userRef, {
                deletionRequested: true,
                deletionRequestedAt: new Date().toISOString(),
              });
              Alert.alert(
                "Request Submitted",
                "Your deletion request has been logged. The clinic will process it within 30 days.",
              );
            } catch (error) {
              Alert.alert("Error", error.message);
            }
          },
        },
      ],
    );
  };

  if (loading)
    return (
      <ActivityIndicator
        size="large"
        color={COLORS.accent}
        style={{ marginTop: 50 }}
      />
    );

  // RA 10173 Step 4.1: Read-only notice for erased accounts.
  // Shown instead of the profile form so the user isn't trapped or confused.
  if (isErased) {
    return (
      <View style={styles.erasedContainer}>
        <View style={styles.erasedCard}>
          <Text style={styles.erasedHeader}>Account Erased</Text>
          <Text style={styles.erasedBody}>
            Your personal data has been removed per your request under RA 10173
            (Philippine Data Privacy Act). If you believe this is an error,
            please contact the clinic directly.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.erasedLogoutBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.erasedLogoutText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBox}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {fullName ? fullName[0].toUpperCase() : "?"}
              </Text>
            </View>
            <Text style={styles.emailText}>{auth.currentUser?.email || ""}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>Pet Owner</Text>
            </View>
          </View>

          {isBookingRedirect && (
            <View style={styles.warningBanner}>
              <MaterialIcons name="error-outline" size={24} color={COLORS.danger} />
              <Text style={styles.warningText}>
                Please complete the highlighted fields below to continue booking
                your appointment.
              </Text>
            </View>
          )}

          <TouchableOpacity onPress={() => toggleSection("personal")}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>👤 Personal Information</Text>
              <MaterialIcons
                name={collapsedSections.personal ? "expand-more" : "expand-less"}
                size={24}
                color={COLORS.accentLight}
              />
            </View>
          </TouchableOpacity>
          {!collapsedSections.personal && (
            <View style={styles.card}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={[styles.input, getHighlightStyle(fullName)]}
                value={fullName}
                onChangeText={setFullName}
              />

              <Text style={styles.label}>Mobile Number *</Text>
              <TextInput
                style={[styles.input, getHighlightStyle(phone)]}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={11}
                placeholder="09xxxxxxxxx"
              />

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="name@example.com"
              />

              <Text style={styles.label}>Secondary Phone</Text>
              <TextInput
                style={styles.input}
                value={secondaryPhone}
                onChangeText={setSecondaryPhone}
                keyboardType="phone-pad"
                maxLength={11}
                placeholder="09xxxxxxxxx (Optional)"
              />

              <Text style={styles.label}>
                Date of Birth (For SC/PWD Verification)
              </Text>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={[styles.dateBtnText, !dob && { color: COLORS.muted }]}>
                  {dob ? dob.toLocaleDateString() : "Tap to select date"}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={dob || new Date(1990, 0, 1)}
                  mode="date"
                  display="default"
                  maximumDate={new Date()}
                  onChange={(e, d) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (d) setDob(d);
                  }}
                />
              )}
            </View>
          )}

          <TouchableOpacity onPress={() => toggleSection("address")}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>🏡 Address</Text>
              <MaterialIcons
                name={collapsedSections.address ? "expand-more" : "expand-less"}
                size={24}
                color={COLORS.accentLight}
              />
            </View>
          </TouchableOpacity>
          {!collapsedSections.address && (
            <View style={styles.card}>
              <Text style={styles.label}>Street / Subdivision / Barangay *</Text>
              <TextInput
                style={[styles.input, getHighlightStyle(address)]}
                value={address}
                onChangeText={setAddress}
                placeholder="e.g. 123 Main St, Brgy. Poblacion"
              />
              <Text style={styles.label}>City / Municipality *</Text>
              <TextInput
                style={[styles.input, getHighlightStyle(city)]}
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Dagupan City"
              />
            </View>
          )}

          <TouchableOpacity onPress={() => toggleSection("emergency")}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>
                🚨 Emergency & Identifications
              </Text>
              <MaterialIcons
                name={collapsedSections.emergency ? "expand-more" : "expand-less"}
                size={24}
                color={COLORS.accentLight}
              />
            </View>
          </TouchableOpacity>
          {!collapsedSections.emergency && (
            <View style={styles.card}>
            {/* DYNAMIC EMERGENCY CONTACTS ARRAY */}
            {emergencyContacts.map((contact, index) => (
              <View
                key={index}
                style={index > 0 ? styles.extraContactBox : null}
              >
                {index > 0 && (
                  <View style={styles.contactHeader}>
                    <Text style={styles.contactTitle}>
                      Additional Contact #{index + 1}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeEmergencyContact(index)}
                    >
                      <MaterialIcons name="cancel" size={22} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.label}>
                  Emergency Contact Name {index === 0 ? "*" : ""}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    index === 0 ? getHighlightStyle(contact.name) : {},
                  ]}
                  value={contact.name}
                  onChangeText={(val) =>
                    updateEmergencyContact(index, "name", val)
                  }
                  placeholder="e.g. Maria Clara"
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>
                      Number {index === 0 ? "*" : ""}
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        index === 0 ? getHighlightStyle(contact.phone) : {},
                      ]}
                      value={contact.phone}
                      onChangeText={(val) =>
                        updateEmergencyContact(index, "phone", val)
                      }
                      keyboardType="phone-pad"
                      maxLength={11}
                      placeholder="09..."
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Relation</Text>
                    <TextInput
                      style={styles.input}
                      value={contact.relation}
                      onChangeText={(val) =>
                        updateEmergencyContact(index, "relation", val)
                      }
                      placeholder="e.g. Spouse"
                    />
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity
              style={styles.addContactBtn}
              onPress={addEmergencyContact}
            >
              <MaterialIcons
                name="add-circle-outline"
                size={20}
                color={COLORS.info}
              />
              <Text style={styles.addContactText}>Add Another Contact</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <Text style={styles.label}>Senior Citizen / PWD ID</Text>
            <TextInput
              style={styles.input}
              value={seniorId}
              onChangeText={setSeniorId}
              placeholder="ID Number (Optional)"
            />
            <Text style={styles.helperText}>
              Used to automatically apply legal discounts on eligible services.
            </Text>

            <View style={styles.divider} />

            <Text style={styles.label}>Government ID Type</Text>
            <View style={styles.toggleGroup}>
              {["Driver's License", "Passport", "PhilID", "Other"].map((idType) => (
                <TouchableOpacity
                  key={idType}
                  style={[
                    styles.toggleBtn,
                    govIdType === idType && styles.activeToggle,
                  ]}
                  onPress={() => {
                    const next = govIdType === idType ? "" : idType;
                    setGovIdType(next);
                    if (next === "") setGovIdNumber("");
                  }}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      govIdType === idType && styles.activeText,
                      { fontSize: 11 },
                    ]}
                  >
                    {idType}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {govIdType !== "" && (
              <>
                <Text style={[styles.label, { marginTop: 10 }]}>ID Number</Text>
                <TextInput
                  style={styles.input}
                  value={govIdNumber}
                  onChangeText={setGovIdNumber}
                  placeholder={`Enter ${govIdType} number`}
                />
              </>
            )}
          </View>
          )}

          <TouchableOpacity onPress={() => toggleSection("legal")}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>⚖️ Legal & Privacy</Text>
              <MaterialIcons
                name={collapsedSections.legal ? "expand-more" : "expand-less"}
                size={24}
                color={COLORS.accentLight}
              />
            </View>
          </TouchableOpacity>
          {!collapsedSections.legal && (
            <View style={styles.card}>
            {/* --- DPA CONSENT STATUS --- */}
            {consentVersion != null ? (
              <View>
                <View style={styles.consentStatusRow}>
                  <MaterialIcons name="verified" size={24} color={COLORS.success} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.checkboxTitle, { color: COLORS.success }]}>
                      DPA CONSENT: VERSION {consentVersion}
                    </Text>
                    {consentGrantedAt && (
                      <Text style={styles.checkboxDesc}>
                        Signed on {formatConsentDate(consentGrantedAt)}
                      </Text>
                    )}
                    <Text style={[styles.checkboxDesc, { marginTop: 4 }]}>
                      View your consent records in the clinic admin portal.
                    </Text>
                  </View>
                </View>
                {/* RA 10173 §18 — right to withdraw consent */}
                <TouchableOpacity
                  style={styles.withdrawConsentLink}
                  onPress={handleWithdrawConsent}
                >
                  <Text style={styles.withdrawConsentText}>Withdraw My Consent</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.consentStatusRow}>
                <MaterialIcons name="gpp-bad" size={24} color={COLORS.danger} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.checkboxTitle, { color: COLORS.danger }]}>
                    DPA CONSENT: NOT SIGNED *
                  </Text>
                  <Text style={styles.checkboxDesc}>
                    You must provide Data Privacy Act consent to save your profile.
                  </Text>
                  <TouchableOpacity
                    style={styles.signNowBtn}
                    onPress={() => navigateToConsentScreen()}
                  >
                    <Text style={styles.signNowBtnText}>SIGN NOW ➔</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.divider} />

            {/* --- WAIVER STATUS --- */}
            {waiverVersion != null ? (
              <View style={styles.consentStatusRow}>
                <MaterialIcons name="verified" size={24} color={COLORS.success} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.checkboxTitle, { color: COLORS.success }]}>
                    LIABILITY WAIVER: VERSION {waiverVersion}
                  </Text>
                  {waiverGrantedAt && (
                    <Text style={styles.checkboxDesc}>
                      Signed on {formatConsentDate(waiverGrantedAt)}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.consentStatusRow}
                onPress={navigateToWaiverScreen}
              >
                <MaterialIcons name="check-box-outline-blank" size={24} color={COLORS.accent} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.checkboxTitle}>Liability Waiver</Text>
                  <Text style={styles.checkboxDesc}>
                    Tap to review and sign the liability waiver digitally.
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.accent, fontWeight: '900',
                    textTransform: 'uppercase', marginTop: 4 }}>
                    SIGN NOW ➔
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setAllowPromos(!allowPromos)}
            >
              <MaterialIcons
                name={allowPromos ? "check-box" : "check-box-outline-blank"}
                size={24}
                color={allowPromos ? COLORS.accent : COLORS.muted}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.checkboxTitle}>Promotional Updates</Text>
                <Text style={styles.checkboxDesc}>
                  I agree to receive SMS or Emails regarding clinic promos and
                  announcements.
                </Text>
              </View>
            </TouchableOpacity>

            {allowPromos && (
              <View
                style={{
                  marginTop: 15,
                  paddingTop: 15,
                  borderTopWidth: 1,
                  borderTopColor: "#eee",
                }}
              >
                <Text style={styles.label}>How did you hear about us?</Text>
                <View style={styles.toggleGroup}>
                  {["Walk-in", "Google", "Social Media", "Referral"].map((src) => (
                    <TouchableOpacity
                      key={src}
                      style={[
                        styles.toggleBtn,
                        referralSource === src && styles.activeToggle,
                      ]}
                      onPress={() => setReferralSource(referralSource === src ? "" : src)}
                    >
                      <Text
                        style={[
                          styles.toggleText,
                          referralSource === src && styles.activeText,
                          { fontSize: 10 },
                        ]}
                      >
                        {src}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.label, { marginTop: 10 }]}>Preferred Contact Method</Text>
                <View style={styles.toggleGroup}>
                  {["SMS", "Email", "Voice Call"].map((method) => (
                    <TouchableOpacity
                      key={method}
                      style={[
                        styles.toggleBtn,
                        preferredComm === method && styles.activeToggle,
                      ]}
                      onPress={() => setPreferredComm(method)}
                    >
                      <Text
                        style={[
                          styles.toggleText,
                          preferredComm === method && styles.activeText,
                          { fontSize: 11 },
                        ]}
                      >
                        {method}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.checkboxRow, { marginTop: 10 }]}
                  onPress={() => setWhatsappOptIn(!whatsappOptIn)}
                >
                  <MaterialIcons
                    name={whatsappOptIn ? "check-box" : "check-box-outline-blank"}
                    size={24}
                    color={whatsappOptIn ? COLORS.success : COLORS.muted}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.checkboxTitle}>WhatsApp Notifications</Text>
                    <Text style={styles.checkboxDesc}>
                      I agree to receive appointment updates and reminders via WhatsApp.
                    </Text>
                  </View>
                </TouchableOpacity>

                <Text style={[styles.label, { marginTop: 10 }]}>Gender (For targeted promos)</Text>
                <View style={styles.toggleGroup}>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      gender === "Male" && styles.activeToggle,
                    ]}
                    onPress={() => setGender("Male")}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        gender === "Male" && styles.activeText,
                      ]}
                    >
                      Male
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      gender === "Female" && styles.activeToggle,
                    ]}
                    onPress={() => setGender("Female")}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        gender === "Female" && styles.activeText,
                      ]}
                    >
                      Female
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      gender === "Decline" && styles.activeToggle,
                    ]}
                    onPress={() => setGender("Decline")}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        gender === "Decline" && styles.activeText,
                      ]}
                    >
                      Decline
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          )}

          <TouchableOpacity
            style={[
              styles.saveBtn,
              (!(consentVersion != null || dpaConsent) || saving) && { backgroundColor: COLORS.muted },
            ]}
            onPress={handleUpdate}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? "Processing..." : "Update Profile"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDeleteAccount}
          >
            <Text style={styles.deleteBtnText}>Request Account Deletion</Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  scrollContent: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  headerBox: { alignItems: "center", marginBottom: 20, marginTop: 10 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    elevation: 4,
  },
  avatarText: { color: COLORS.white, fontSize: 36, fontWeight: "900" },
  emailText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 5,
    fontWeight: "bold",
  },
  roleBadge: {
    backgroundColor: "#EFEBE9",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  roleText: {
    color: COLORS.accent,
    fontWeight: "900",
    fontSize: 11,
    textTransform: "uppercase",
  },

  warningBanner: {
    flexDirection: "row",
    backgroundColor: "#FFEBEE",
    padding: 15,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.danger,
    alignItems: "center",
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    marginLeft: 10,
    color: COLORS.danger,
    fontWeight: "bold",
    fontSize: 13,
  },
  missingFieldHighlight: {
    borderColor: COLORS.danger,
    borderWidth: 2,
    backgroundColor: "#FFEBEE",
  },

  sectionHeader: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.accentLight,
    marginBottom: 8,
    marginLeft: 5,
    marginTop: 10,
    textTransform: "uppercase",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 8,
    marginHorizontal: 5,
  },
  card: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#EEEEEE",
  },

  label: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.accent,
    marginBottom: 6,
    marginTop: 5,
  },
  input: {
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    color: COLORS.textPrimary,
  },
  helperText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: "italic",
    marginTop: -8,
    marginBottom: 10,
    lineHeight: 16,
  },

  dateBtn: {
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  dateBtnText: { fontSize: 16, color: COLORS.textPrimary, fontWeight: "500" },

  extraContactBox: {
    marginTop: 10,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  contactHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  contactTitle: { fontSize: 13, fontWeight: "bold", color: COLORS.info },
  addContactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#E3F2FD",
    borderRadius: 10,
    marginTop: 5,
  },
  addContactText: { color: COLORS.info, fontWeight: "bold", marginLeft: 5 },

  divider: { height: 1, backgroundColor: "#EEEEEE", marginVertical: 15 },

  consentStatusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 5,
  },
  signNowBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: COLORS.danger,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  signNowBtnText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 5,
  },
  checkboxTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    marginBottom: 3,
  },
  checkboxDesc: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },

  toggleGroup: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  toggleBtn: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  activeToggle: { backgroundColor: COLORS.accent },
  toggleText: { color: COLORS.accent, fontWeight: "bold", fontSize: 13 },
  activeText: { color: COLORS.white },

  saveBtn: {
    backgroundColor: COLORS.success,
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
    elevation: 3,
  },
  saveBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 18 },
  deleteBtn: { marginTop: 30, alignItems: "center", padding: 10 },
  deleteBtnText: {
    color: COLORS.danger,
    fontWeight: "bold",
    fontSize: 14,
    textDecorationLine: "underline",
  },

  // RA 10173 §18 — Consent withdrawal link (Step 6.1)
  withdrawConsentLink: {
    alignSelf: 'flex-start',
    marginTop: 10,
    marginLeft: 34, // aligns under the text, past the icon (24px icon + 10px margin)
    paddingVertical: 4,
  },
  withdrawConsentText: {
    color: COLORS.danger,
    fontWeight: '900',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textDecorationLine: 'underline',
  },

  // RA 10173 Step 4.1 — erased account read-only notice styles
  erasedContainer: {
    flex: 1,
    backgroundColor: "#FAFAFA",
    padding: 24,
    justifyContent: "center",
  },
  erasedCard: {
    backgroundColor: "#FFEBEE",
    borderWidth: 2,
    borderColor: COLORS.danger,
    padding: 24,
    marginBottom: 24,
  },
  erasedHeader: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.danger,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },
  erasedBody: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  erasedLogoutBtn: {
    backgroundColor: COLORS.accent,
    padding: 18,
    alignItems: "center",
  },
  erasedLogoutText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 16,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
