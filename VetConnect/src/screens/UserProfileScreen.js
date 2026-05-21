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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { COLORS, SHADOW, FONTS } from '../theme/mobileTokens';
import { isValidPHPhone } from "../utils/phoneValidation";

// THE FIX: Notice we added `route` to the props to catch the secret flag!
export default function UserProfileScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
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
  const [referral, setReferral] = useState({ source: '', referredBy: '' });
  const [preferredComm, setPreferredComm] = useState("SMS");

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
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [waiverSigned, setWaiverSigned] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [activeRelationPickerIndex, setActiveRelationPickerIndex] = useState(null);

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
          setReferral({
            source: data.referral?.source || data.referralSource || '',
            referredBy: data.referral?.referredBy || data.referredBy || '',
          });
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
      !emergencyContacts[0]?.name?.trim() ||
      !emergencyContacts[0]?.phone?.trim()
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
        referral: { source: referral.source || null, referredBy: referral.referredBy || null },
        referralSource: referral.source || null,
        referredBy: referral.referredBy || null,
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
                deletionRequestedAt: Timestamp.now(),
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBox}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {fullName ? fullName[0].toUpperCase() : "?"}
              </Text>
            </View>
            <Text style={styles.emailText}>{auth.currentUser?.email || ""}</Text>

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

          <TouchableOpacity onPress={() => toggleSection("personal")} activeOpacity={0.7}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionAnchor} />
              <Text style={styles.sectionHeader}>👤 Personal Information</Text>
              <MaterialIcons
                name={collapsedSections.personal ? "expand-more" : "expand-less"}
                size={22}
                color={COLORS.brand}
              />
            </View>
          </TouchableOpacity>
          {!collapsedSections.personal && (
            <View style={styles.shadowContainer}>
              <View style={SHADOW.card} />
              <View style={styles.card}>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  style={[styles.input, getHighlightStyle(fullName)]}
                  value={fullName}
                  onChangeText={setFullName}
                />

                <Text style={styles.label}>Mobile Number *</Text>
                <TextInput
                  style={[styles.input, styles.monospaceInput, getHighlightStyle(phone)]}
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
                  style={[styles.input, styles.monospaceInput]}
                  value={secondaryPhone}
                  onChangeText={setSecondaryPhone}
                  keyboardType="phone-pad"
                  maxLength={11}
                  placeholder="09xxxxxxxxx (Optional)"
                />

                <Text style={styles.label}>
                  Date of Birth
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
            </View>
          )}

          <TouchableOpacity onPress={() => toggleSection("address")} activeOpacity={0.7}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionAnchor} />
              <Text style={styles.sectionHeader}>🏡 Address</Text>
              <MaterialIcons
                name={collapsedSections.address ? "expand-more" : "expand-less"}
                size={22}
                color={COLORS.brand}
              />
            </View>
          </TouchableOpacity>
          {!collapsedSections.address && (
            <View style={styles.shadowContainer}>
              <View style={SHADOW.card} />
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
            </View>
          )}

          <TouchableOpacity onPress={() => toggleSection("emergency")} activeOpacity={0.7}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionAnchor} />
              <Text style={styles.sectionHeader}>🚨 Emergency & IDs</Text>
              <MaterialIcons
                name={collapsedSections.emergency ? "expand-more" : "expand-less"}
                size={22}
                color={COLORS.brand}
              />
            </View>
          </TouchableOpacity>
          {!collapsedSections.emergency && (
            <View style={styles.shadowContainer}>
              <View style={SHADOW.card} />
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
                    <TouchableOpacity
                      style={styles.dropdownBtn}
                      activeOpacity={0.7}
                      onPress={() => setActiveRelationPickerIndex(activeRelationPickerIndex === index ? null : index)}
                    >
                      <Text style={styles.dropdownBtnText}>
                        {contact.relation || "SELECT..."}
                      </Text>
                      <MaterialIcons
                        name={activeRelationPickerIndex === index ? "expand-less" : "expand-more"}
                        size={20}
                        color={COLORS.brand}
                      />
                    </TouchableOpacity>

                    {activeRelationPickerIndex === index && (
                      <View style={styles.dropdownList}>
                        {['Spouse', 'Parent', 'Sibling', 'Child', 'Relative', 'Friend', 'Caretaker', 'Other'].map(r => (
                          <TouchableOpacity
                            key={r}
                            style={styles.dropdownItem}
                            onPress={() => {
                              updateEmergencyContact(index, 'relation', r);
                              setActiveRelationPickerIndex(null);
                            }}
                          >
                            <Text style={[
                              styles.dropdownItemText,
                              contact.relation === r && { fontWeight: '900', color: COLORS.sky }
                            ]}>
                              {r.toUpperCase()}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
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
            </View>
          )}

          <TouchableOpacity onPress={() => toggleSection("legal")} activeOpacity={0.7}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionAnchor} />
              <Text style={styles.sectionHeader}>⚖️ Legal & Privacy</Text>
              <MaterialIcons
                name={collapsedSections.legal ? "expand-more" : "expand-less"}
                size={22}
                color={COLORS.brand}
              />
            </View>
          </TouchableOpacity>
          {!collapsedSections.legal && (
            <View style={styles.shadowContainer}>
              <View style={SHADOW.card} />
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
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {REFERRAL_SOURCES.map((src) => (
                    <TouchableOpacity
                      key={src}
                      onPress={() => handleReferralSourceChange(src)}
                      style={{
                        paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5,
                        borderColor: referral.source === src ? COLORS.sky : '#ccc',
                        backgroundColor: referral.source === src ? COLORS.sky + '15' : '#fff',
                      }}
                    >
                      <Text style={{
                        fontSize: 11, fontWeight: referral.source === src ? '900' : '600',
                        color: referral.source === src ? COLORS.sky : '#666',
                      }}>{src}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {REFERRAL_NEEDS_NAME.includes(referral.source) && (
                  <>
                    <Text style={[styles.label, { marginTop: 8 }]}>Referred by</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Name of referring client or vet"
                      value={referral.referredBy}
                      onChangeText={(v) => setReferral(prev => ({ ...prev, referredBy: v }))}
                    />
                  </>
                )}

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
            </View>
          )}

          <View style={styles.shadowContainer}>
            <View style={SHADOW.button} />
            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!(consentVersion != null || dpaConsent) || saving) && { backgroundColor: COLORS.muted },
              ]}
              onPress={handleUpdate}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>
                {saving ? "PROCESSING..." : "UPDATE PROFILE"}
              </Text>
            </TouchableOpacity>
          </View>

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
  container: { flex: 1, backgroundColor: COLORS.cream },
  scrollContent: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  headerBox: { alignItems: "center", marginBottom: 20, marginTop: 10 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 0,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  avatarText: { color: COLORS.brand, fontSize: 36, fontWeight: "900" },
  emailText: {
    fontSize: 14,
    color: COLORS.accentLight,
    marginBottom: 5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: "bold",
  },
  roleBadge: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  roleText: {
    color: COLORS.brand,
    fontWeight: "900",
    fontSize: 11,
    textTransform: "uppercase",
  },

  warningBanner: {
    flexDirection: "row",
    backgroundColor: COLORS.dangerBg,
    padding: 15,
    borderRadius: 0,
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
    backgroundColor: COLORS.dangerBg,
  },

  sectionHeader: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.brand,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 12,
    gap: 8,
  },
  sectionAnchor: {
    width: 8,
    height: 18,
    backgroundColor: COLORS.brand,
  },
  shadowContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  card: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },

  label: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.brand,
    marginBottom: 6,
    marginTop: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
    color: COLORS.textPrimary,
  },
  monospaceInput: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: 'bold',
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
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 12,
    marginBottom: 15,
  },
  dateBtnText: { fontSize: 16, color: COLORS.textPrimary, fontWeight: "bold" },

  extraContactBox: {
    marginTop: 10,
    paddingTop: 15,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderTopColor: COLORS.borderLight,
  },
  contactHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  contactTitle: { fontSize: 12, fontWeight: "900", color: COLORS.brand, textTransform: 'uppercase' },
  addContactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    marginTop: 5,
  },
  addContactText: { color: COLORS.brand, fontWeight: "900", textTransform: 'uppercase', fontSize: 12 },

  divider: { height: 2, backgroundColor: COLORS.borderLight, marginVertical: 15, borderStyle: 'dashed' },

  consentStatusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 5,
  },
  signNowBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: COLORS.sky,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
  },
  dropdownBtn: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dropdownBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.brand,
    textTransform: 'uppercase',
  },
  dropdownList: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderTopWidth: 0,
    marginTop: -12,
    marginBottom: 15,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dropdownItemText: {
    fontSize: 12,
    color: COLORS.brand,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  signNowBtnText: {
    color: COLORS.textOnSky,
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
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.brand,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  checkboxDesc: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },

  toggleGroup: {
    flexDirection: "row",
    borderRadius: 0,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  toggleBtn: {
    flex: 1,
    padding: 10,
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  activeToggle: { backgroundColor: COLORS.brand },
  toggleText: { color: COLORS.brand, fontWeight: "900", fontSize: 12, textTransform: 'uppercase' },
  activeText: { color: COLORS.white },

  saveBtn: {
    backgroundColor: COLORS.success,
    padding: 18,
    borderRadius: 0,
    borderWidth: 3,
    borderColor: COLORS.brand,
    alignItems: "center",
  },
  saveBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 18, letterSpacing: 2 },
  deleteBtn: { marginTop: 30, alignItems: "center", padding: 10 },
  deleteBtnText: {
    color: COLORS.danger,
    fontWeight: "900",
    fontSize: 12,
    textTransform: 'uppercase',
    textDecorationLine: "underline",
  },

  withdrawConsentLink: {
    alignSelf: 'flex-start',
    marginTop: 10,
    marginLeft: 34,
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

  erasedContainer: {
    flex: 1,
    backgroundColor: COLORS.cream,
    padding: 24,
    justifyContent: "center",
  },
  erasedCard: {
    backgroundColor: COLORS.dangerBg,
    borderWidth: 3,
    borderColor: COLORS.danger,
    padding: 24,
    marginBottom: 24,
    borderRadius: 0,
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
    backgroundColor: COLORS.brand,
    padding: 18,
    alignItems: "center",
    borderRadius: 0,
    borderWidth: 3,
    borderColor: COLORS.brand,
  },
  erasedLogoutText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 16,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
