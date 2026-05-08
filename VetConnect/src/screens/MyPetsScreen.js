import { MaterialIcons } from "@expo/vector-icons";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { COLORS, FONTS, SHADOW } from '../theme/mobileTokens';
import { calculateAge } from '../utils/helpers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchVaccineCatalog, buildVaccinationStatus } from '../utils/vaccineHelpers';

// Sort option definitions — single source of truth for labels and sort logic keys
const SORT_OPTIONS = [
  { key: 'az',          label: 'Name (A → Z)',       shortLabel: 'A-Z'    },
  { key: 'za',          label: 'Name (Z → A)',       shortLabel: 'Z-A'    },
  { key: 'newest',      label: 'Newest First',       shortLabel: 'New'    },
  { key: 'oldest',      label: 'Oldest First',       shortLabel: 'Old'    },
  { key: 'ageYoung',    label: 'Age (Youngest)',     shortLabel: 'Young'  },
  { key: 'ageOld',      label: 'Age (Oldest)',       shortLabel: 'Old'    },
  { key: 'visitRecent', label: 'Last Visit (Recent)','shortLabel': 'Recent'},
  { key: 'visitOldest', label: 'Last Visit (Oldest)','shortLabel': 'Visit' },
];

export default function MyPetsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("All");
  const [genderFilter, setGenderFilter] = useState("All");
  const [healthFilter, setHealthFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("az");

  // Bottom sheet open/close state
  const [vaccineCatalog, setVaccineCatalog] = useState([]);
  const [speciesSheetOpen, setSpeciesSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  useEffect(() => {
    fetchVaccineCatalog().then(setVaccineCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    // T2.377: Guard against auth null during navigation transitions
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, "pets"),
      where("ownerId", "==", auth.currentUser.uid),
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      // T2.375: Parallelize medical record lookups
      const petList = await Promise.all(
        snapshot.docs.map(async (petDoc) => {
          const petData = { id: petDoc.id, ...petDoc.data() };
          try {
            const medQ = query(
              collection(db, "medical_records"),
              where("petId", "==", petData.id),
              orderBy("date", "desc"),
              limit(20),
            );
            const medSnap = await getDocs(medQ);

            const medicalRecord = medSnap.docs.find(
              (d) => d.data().recordType === "medical"
            );
            if (medicalRecord) {
              petData.lastVisit = medicalRecord.data().date;
            }

            petData._medicalRecords = medSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const dueDates = [];
            medSnap.docs.forEach((vDoc) => {
              const vData = vDoc.data();
              if (vData.vaccineAdministrations?.length > 0) {
                vData.vaccineAdministrations.forEach((vax) => {
                  if (vax.dueDate) dueDates.push({ name: vax.vaccineName || vax.name || 'Vaccine', dueDate: vax.dueDate });
                });
              } else if (vData.vaccineData?.dueDate) {
                dueDates.push({ name: vData.vaccineData.vaccineName || vData.vaccineData.name || 'Vaccine', dueDate: vData.vaccineData.dueDate });
              }
            });
            petData.vaccineDueDates = dueDates;
          } catch (e) {
            console.log(e);
          }
          return petData;
        })
      );
      setPets(petList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  const handleDelete = async (petId, petName) => {
    Alert.alert(
      "Archive Pet?",
      `Are you sure you want to archive ${petName}? This will hide them from your pet list. Contact the clinic to restore.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: async () => {
            try {
              // T2.376: Soft archive instead of hard delete
              await updateDoc(doc(db, "pets", petId), {
                status: "archived",
                archivedAt: Timestamp.now(),
                archivedBy: auth.currentUser?.uid || "unknown",
              });
            } catch (error) {
              Alert.alert("Error", error.message);
            }
          },
        },
      ],
    );
  };

  const getHealthStatus = (item) => {
    if (vaccineCatalog.length > 0 && item._medicalRecords) {
      const { completeness } = buildVaccinationStatus(item._medicalRecords, vaccineCatalog, item.species);
      if (completeness) {
        if (completeness.administered === 0) return 'Needs Checkup';
        if (completeness.percentage === 100) return 'Up to Date';
        const vaxResult = getVaccineStatus(item);
        if (vaxResult?.status === 'Overdue') return 'Overdue';
        if (vaxResult?.status === 'Due Soon') return 'Due Soon';
        return 'Up to Date';
      }
    }
    const vaxResult = getVaccineStatus(item);
    if (vaxResult?.status === 'Overdue') return 'Overdue';
    if (vaxResult?.status === 'Due Soon') return 'Due Soon';
    if (vaxResult?.status === 'Current') return 'Up to Date';
    if (!item.lastVisit) return 'Needs Checkup';
    const lastVisitDate = item.lastVisit?.toDate
      ? item.lastVisit.toDate()
      : new Date(item.lastVisit?.seconds ? item.lastVisit.seconds * 1000 : item.lastVisit);
    const daysSinceVisit = (new Date() - lastVisitDate) / (1000 * 60 * 60 * 24);
    if (isNaN(daysSinceVisit)) return 'Needs Checkup';
    if (daysSinceVisit > 365) return 'Needs Checkup';
    return 'Up to Date';
  };

  const getVaccineStatus = (item) => {
    const dueDates = item.vaccineDueDates;
    if (!dueDates || dueDates.length === 0) return null;

    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const overdueNames = [];
    const dueSoonNames = [];

    dueDates.forEach((entry) => {
      const raw = entry?.dueDate || entry;
      const name = entry?.name || 'Vaccine';
      const dueDate = typeof raw === "string" ? new Date(raw) : raw?.toDate ? raw.toDate() : raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw);
      if (isNaN(dueDate.getTime())) return;
      if (dueDate < now) overdueNames.push(name);
      else if (dueDate < thirtyDaysFromNow) dueSoonNames.push(name);
    });

    if (overdueNames.length > 0) return { status: "Overdue", names: overdueNames };
    if (dueSoonNames.length > 0) return { status: "Due Soon", names: dueSoonNames };
    return { status: "Current", names: [] };
  };

  // ── Count helpers for bottom sheet option lists ─────────────────

  /** Counts per species value (from unarchived pets). */
  const speciesCounts = useMemo(() => {
    const activePets = pets.filter(p => p.status !== "archived");
    const counts = { All: activePets.length, Canine: 0, Feline: 0 };
    activePets.forEach(p => {
      if (p.species === 'Dog' || p.species === 'Canine') counts.Canine++;
      if (p.species === 'Cat' || p.species === 'Feline') counts.Feline++;
    });
    return counts;
  }, [pets]);

  /** Counts per gender value (from unarchived pets). */
  const genderCounts = useMemo(() => {
    const activePets = pets.filter(p => p.status !== "archived");
    const counts = { All: activePets.length, Male: 0, Female: 0 };
    activePets.forEach(p => {
      const g = (p.gender || '').toLowerCase();
      if (g === 'male') counts.Male++;
      if (g === 'female') counts.Female++;
    });
    return counts;
  }, [pets]);

  /** Counts per health status value (from unarchived pets). */
  const healthCounts = useMemo(() => {
    const activePets = pets.filter(p => p.status !== "archived");
    const counts = { All: activePets.length, 'Up to Date': 0, 'Due Soon': 0, Overdue: 0, 'Needs Checkup': 0 };
    activePets.forEach(p => {
      const status = getHealthStatus(p);
      if (counts[status] != null) counts[status]++;
    });
    return counts;
  }, [pets]);

  const processedPets = useMemo(() => {
    let result = [...pets].filter((p) => p.status !== "archived");
    if (searchText) {
      const lowerSearch = searchText.toLowerCase();
      result = result.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(lowerSearch)) ||
          (p.breed && p.breed.toLowerCase().includes(lowerSearch)),
      );
    }
    if (speciesFilter !== "All") {
      result = result.filter((p) => {
        if (speciesFilter === "Canine")
          return p.species === "Dog" || p.species === "Canine";
        if (speciesFilter === "Feline")
          return p.species === "Cat" || p.species === "Feline";
        return true;
      });
    }
    if (genderFilter !== "All") {
      result = result.filter((p) => {
        const g = (p.gender || "").toLowerCase();
        if (genderFilter === "Male") return g === "male";
        if (genderFilter === "Female") return g === "female";
        return true;
      });
    }
    if (healthFilter !== "All") {
      result = result.filter((p) => {
        const status = getHealthStatus(p);
        return status === healthFilter;
      });
    }

    // ── Sort (expanded to 8 directions) ──────────────────────────
    if (sortOrder === "az") {
      result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortOrder === "za") {
      result.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    } else if (sortOrder === "newest") {
      result.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
    } else if (sortOrder === "oldest") {
      result.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeA - timeB;
      });
    } else if (sortOrder === "ageYoung") {
      // Youngest = most recent DOB (highest timestamp)
      result.sort((a, b) => {
        const dobA = a.dob?.toMillis ? a.dob.toMillis() : a.dob ? new Date(a.dob).getTime() : 0;
        const dobB = b.dob?.toMillis ? b.dob.toMillis() : b.dob ? new Date(b.dob).getTime() : 0;
        return dobB - dobA;
      });
    } else if (sortOrder === "ageOld") {
      // Oldest = earliest DOB (lowest timestamp)
      result.sort((a, b) => {
        const dobA = a.dob?.toMillis ? a.dob.toMillis() : a.dob ? new Date(a.dob).getTime() : 0;
        const dobB = b.dob?.toMillis ? b.dob.toMillis() : b.dob ? new Date(b.dob).getTime() : 0;
        return dobA - dobB;
      });
    } else if (sortOrder === "visitRecent") {
      result.sort((a, b) => {
        const visitA = a.lastVisit?.toMillis ? a.lastVisit.toMillis() :
          a.lastVisit?.seconds ? a.lastVisit.seconds * 1000 : 0;
        const visitB = b.lastVisit?.toMillis ? b.lastVisit.toMillis() :
          b.lastVisit?.seconds ? b.lastVisit.seconds * 1000 : 0;
        return visitB - visitA;
      });
    } else if (sortOrder === "visitOldest") {
      result.sort((a, b) => {
        const visitA = a.lastVisit?.toMillis ? a.lastVisit.toMillis() :
          a.lastVisit?.seconds ? a.lastVisit.seconds * 1000 : 0;
        const visitB = b.lastVisit?.toMillis ? b.lastVisit.toMillis() :
          b.lastVisit?.seconds ? b.lastVisit.seconds * 1000 : 0;
        return visitA - visitB;
      });
    }

    return result;
  }, [pets, searchText, speciesFilter, genderFilter, healthFilter, sortOrder]);

  // Badge counts for the filter icon buttons
  const activeFilterCount = (genderFilter !== "All" ? 1 : 0) + (healthFilter !== "All" ? 1 : 0);
  const currentSortOption = SORT_OPTIONS.find(o => o.key === sortOrder) || SORT_OPTIONS[0];

  const renderPetCard = ({ item }) => {
    const speciesEmoji = item.species === "Canine" || item.species === "Dog" ? "🐶" : "🐱";
    const ageText = calculateAge(item.dob);
    const breed = item.breed || item.species || "";
    const metaParts = [item.species, breed].filter(Boolean);

    const weight = item.lastVitals?.weight ?? item.weight ?? item.lastWeight;
    const weightText = weight != null ? `${weight} kg` : "—";

    const sexText = item.gender
      ? `${item.gender} · ${item.isNeutered ? "FIXED" : "INTACT"}`
      : "—";

    const allergyVal = item.petAllergies || item.allergies;
    const hasAllergies = allergyVal && allergyVal.trim() !== "" && allergyVal !== "None";

    const vaxResult = getVaccineStatus(item);
    const vaxColor = vaxResult?.status === "Overdue" ? COLORS.danger
      : vaxResult?.status === "Due Soon" ? COLORS.warning
      : vaxResult ? COLORS.success
      : COLORS.textMuted;
    const vaxLabel = vaxResult?.status === "Overdue" ? "OVERDUE"
      : vaxResult?.status === "Due Soon" ? "DUE SOON"
      : vaxResult?.status === "Current" ? "UP TO DATE"
      : "NO RECORDS";
    const vaxNames = vaxResult?.names ?? [];

    return (
      <View style={styles.cardWrapper}>
        {/* Neubrutalist offset shadow layer — sits behind the card */}
        <View style={styles.cardShadow} />
        <View style={styles.card}>

          {/* ── HEADER: emoji + name/meta + edit/delete ─────────────── */}
          <View style={styles.cardHeader}>
            <Text style={styles.petCardEmoji}>{speciesEmoji}</Text>
            <View style={styles.petCardHeaderText}>
              <Text style={styles.petName}>{item.name}</Text>
              <Text style={styles.petCardMeta}>{metaParts.join(' · ')}</Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                style={styles.iconBtn}
                android_ripple={{ color: COLORS.borderLight, borderless: true }}
                onPress={() => navigation.navigate("EditPet", { pet: item })}
              >
                <MaterialIcons name="edit" size={20} color={COLORS.accent} />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                android_ripple={{ color: COLORS.dangerBg, borderless: true }}
                onPress={() => handleDelete(item.id, item.name)}
              >
                <MaterialIcons name="delete-outline" size={20} color={COLORS.danger} />
              </Pressable>
            </View>
          </View>

          <View style={styles.petCardDivider} />

          {/* ── DATA ROWS ─────────────────────────────────────────────── */}
          <View style={styles.petCardRow}>
            <Text style={styles.petCardRowLabel}>WEIGHT</Text>
            <View style={styles.petCardRowContent}>
              <Text style={styles.petCardValue}>{weightText}</Text>
            </View>
          </View>

          <View style={styles.petCardDivider} />

          <View style={styles.petCardRow}>
            <Text style={styles.petCardRowLabel}>AGE</Text>
            <View style={styles.petCardRowContent}>
              <Text style={styles.petCardValue}>{ageText}</Text>
            </View>
          </View>

          <View style={styles.petCardDivider} />

          <View style={styles.petCardRow}>
            <Text style={styles.petCardRowLabel}>SEX</Text>
            <View style={styles.petCardRowContent}>
              <Text style={styles.petCardValue}>{sexText}</Text>
            </View>
          </View>

          {item.microchipId && (
            <>
              <View style={styles.petCardDivider} />
              <View style={styles.petCardRow}>
                <Text style={styles.petCardRowLabel}>MICROCHIP</Text>
                <View style={styles.petCardRowContent}>
                  <Text style={[styles.petCardValue, { color: COLORS.info }]}>
                    {item.microchipId}
                  </Text>
                </View>
              </View>
            </>
          )}

          <View style={styles.petCardDivider} />

          {/* ── VACCINES ROW ──────────────────────────────────────────── */}
          <View style={styles.petCardRow}>
            <Text style={styles.petCardRowLabel}>VACCINES</Text>
            <View style={styles.petCardRowContent}>
              <Text style={[styles.petCardValue, { color: vaxColor }]}>{vaxLabel}</Text>
              {vaxNames.length > 0 && (
                <Text style={[styles.petCardValueMuted, { color: vaxColor }]}>
                  {vaxNames.length <= 3
                    ? vaxNames.join(", ")
                    : `${vaxNames.slice(0, 2).join(", ")} +${vaxNames.length - 2} more`}
                </Text>
              )}
            </View>
          </View>

          {/* ── ALLERGIES ROW (conditional) ───────────────────────────── */}
          {hasAllergies && (
            <>
              <View style={styles.petCardDivider} />
              <View style={[styles.petCardRow, styles.allergyRow]}>
                <MaterialIcons name="warning" size={13} color={COLORS.warning} style={{ marginRight: 4 }} />
                <Text style={styles.petCardRowLabel}>ALLERGIES</Text>
                <View style={styles.petCardRowContent}>
                  <Text style={[styles.petCardValue, { color: COLORS.warning }]}>
                    {allergyVal}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* ── ACTION BUTTONS ────────────────────────────────────────── */}
          <View style={styles.footerActions}>
            <Pressable
              style={({ pressed }) => [
                styles.mainBtn,
                styles.bookBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={() =>
                navigation.navigate("BookAppointment", { prefillPetId: item.id })
              }
            >
              <MaterialIcons name="calendar-today" size={18} color={COLORS.white} />
              <Text style={styles.bookBtnText}>BOOK VISIT</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.mainBtn,
                styles.chartBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={() =>
                navigation.navigate("PetHistory", {
                  petId: item.id,
                  petName: item.name,
                })
              }
            >
              <MaterialIcons name="assessment" size={18} color={COLORS.sky} />
              <Text style={styles.chartBtnText}>VIEW CHART</Text>
            </Pressable>
          </View>

        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Compact search + filter row (replaces 4 rows) ─────────── */}
      <View style={styles.controlBar}>
        <View style={styles.searchFilterRow}>
          {/* Search bar — flex:1 so it fills remaining width */}
          <View style={styles.searchContainer}>
            <MaterialIcons
              name="search"
              size={22}
              color={COLORS.textMuted}
              style={{ marginLeft: 15 }}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              placeholderTextColor={COLORS.textMuted}
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>

          {/* Species filter button — badge when not "All" */}
          <TouchableOpacity
            style={styles.filterIconBtn}
            onPress={() => setSpeciesSheetOpen(true)}
          >
            <Text style={{ fontSize: 18 }}>🐾</Text>
            {speciesFilter !== "All" && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>1</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Gender + Health combined filter button — badge with active count */}
          <TouchableOpacity
            style={styles.filterIconBtn}
            onPress={() => setFilterSheetOpen(true)}
          >
            <MaterialIcons name="tune" size={18} color={COLORS.accent} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Sort button — shows current sort's short label */}
          <TouchableOpacity
            style={styles.sortIconBtn}
            onPress={() => setSortSheetOpen(true)}
          >
            <MaterialIcons name="swap-vert" size={16} color={COLORS.accent} />
            <Text style={styles.sortIconText}>{currentSortOption.shortLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.accent}
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={processedPets}
          keyExtractor={(item) => item.id}
          renderItem={renderPetCard}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 100, paddingTop: 15 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 60, marginBottom: 10 }}>🐾</Text>
              <Text style={styles.emptyText}>
                {searchText || speciesFilter !== "All" || genderFilter !== "All" || healthFilter !== "All"
                  ? "No pets match your filters."
                  : "No pets added yet."}
              </Text>
              {!searchText && speciesFilter === "All" && genderFilter === "All" && healthFilter === "All" && (
                <Text style={styles.emptySub}>
                  Register your pet to start tracking their health.
                </Text>
              )}
            </View>
          }
        />
      )}

      {/* FAB with neubrutalist shadow */}
      <View style={styles.fabWrapper}>
        <View style={styles.fabShadow} />
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate("AddPet")}
        >
          <MaterialIcons name="add" size={24} color={COLORS.white} />
          <Text style={styles.fabText}>Add New Pet</Text>
        </TouchableOpacity>
      </View>

      {/* ── SPECIES FILTER BOTTOM SHEET ─────────────────────────────── */}
      <Modal
        visible={speciesSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSpeciesSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.filterOverlay}
          activeOpacity={1}
          onPress={() => setSpeciesSheetOpen(false)}
        >
          <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.filterSheetHandle} />
            <Text style={styles.filterSheetTitle}>FILTER BY SPECIES</Text>

            {[
              { value: 'All',    label: 'All Pets', emoji: '🐾' },
              { value: 'Canine', label: 'Dogs',     emoji: '🐶' },
              { value: 'Feline', label: 'Cats',     emoji: '🐱' },
            ].map(({ value, label, emoji }) => {
              const isSelected = speciesFilter === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={styles.filterSheetRow}
                  onPress={() => {
                    setSpeciesFilter(value);
                    setSpeciesSheetOpen(false);
                  }}
                >
                  <MaterialIcons
                    name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={22}
                    color={isSelected ? COLORS.sky : COLORS.textMuted}
                  />
                  <Text style={styles.filterSheetEmoji}>{emoji}</Text>
                  <Text style={[styles.filterSheetLabel, isSelected && styles.filterSheetLabelActive]}>
                    {label}
                  </Text>
                  <Text style={styles.filterSheetCount}>({speciesCounts[value] ?? 0})</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── GENDER + HEALTH COMBINED FILTER BOTTOM SHEET ────────────── */}
      <Modal
        visible={filterSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.filterOverlay}
          activeOpacity={1}
          onPress={() => setFilterSheetOpen(false)}
        >
          <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.filterSheetHandle} />
            <Text style={styles.filterSheetTitle}>FILTER PETS</Text>

            <ScrollView style={styles.filterSheetScroll}>
              {/* Gender section */}
              <Text style={styles.filterSheetSection}>GENDER</Text>
              {[
                { value: 'All',    label: 'Any' },
                { value: 'Male',   label: 'Male' },
                { value: 'Female', label: 'Female' },
              ].map(({ value, label }) => {
                const isSelected = genderFilter === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={styles.filterSheetRow}
                    onPress={() => setGenderFilter(value)}
                  >
                    <MaterialIcons
                      name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={22}
                      color={isSelected ? COLORS.sky : COLORS.textMuted}
                    />
                    <Text style={[styles.filterSheetLabel, isSelected && styles.filterSheetLabelActive]}>
                      {label}
                    </Text>
                    <Text style={styles.filterSheetCount}>({genderCounts[value] ?? 0})</Text>
                  </TouchableOpacity>
                );
              })}

              {/* Health Status section */}
              <Text style={[styles.filterSheetSection, { marginTop: 16 }]}>VACCINE STATUS</Text>
              {[
                { value: 'All',           label: 'Any' },
                { value: 'Up to Date',    label: 'Up to Date' },
                { value: 'Due Soon',      label: 'Due Soon' },
                { value: 'Overdue',       label: 'Overdue' },
                { value: 'Needs Checkup', label: 'Needs Checkup' },
              ].map(({ value, label }) => {
                const isSelected = healthFilter === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={styles.filterSheetRow}
                    onPress={() => setHealthFilter(value)}
                  >
                    <MaterialIcons
                      name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={22}
                      color={isSelected ? COLORS.sky : COLORS.textMuted}
                    />
                    <Text style={[styles.filterSheetLabel, isSelected && styles.filterSheetLabelActive]}>
                      {label}
                    </Text>
                    <Text style={styles.filterSheetCount}>({healthCounts[value] ?? 0})</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* CLEAR ALL resets both gender and health, but does not close the sheet */}
            <View style={styles.filterSheetActions}>
              <TouchableOpacity
                style={styles.filterSheetClearBtn}
                onPress={() => {
                  setGenderFilter("All");
                  setHealthFilter("All");
                }}
              >
                <Text style={styles.filterSheetClearText}>CLEAR ALL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── SORT BOTTOM SHEET ────────────────────────────────────────── */}
      <Modal
        visible={sortSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.filterOverlay}
          activeOpacity={1}
          onPress={() => setSortSheetOpen(false)}
        >
          <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.filterSheetHandle} />
            <Text style={styles.filterSheetTitle}>SORT BY</Text>

            {SORT_OPTIONS.map(({ key, label }) => {
              const isSelected = sortOrder === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.filterSheetRow}
                  onPress={() => {
                    setSortOrder(key);
                    setSortSheetOpen(false);
                  }}
                >
                  <MaterialIcons
                    name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={22}
                    color={isSelected ? COLORS.sky : COLORS.textMuted}
                  />
                  <Text style={[styles.filterSheetLabel, isSelected && styles.filterSheetLabelActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Screen shell ────────────────────────────────────────────────
  container: { flex: 1, backgroundColor: COLORS.cream },

  // ── Control bar (search + filter icon buttons) ──────────────────
  controlBar: {
    backgroundColor: COLORS.white,
    padding: 15,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
  },

  // Single compact row: [search flex:1] [🐾] [⚙] [↕ A-Z]
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Search bar — flex:1, zero radius, thick espresso border
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.accent,
    height: 44,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: "600",
  },

  // Square icon filter buttons
  filterIconBtn: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  // Badge on filter buttons — sky blue, neubrutalist (zero radius)
  filterBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.sky,
    borderRadius: 0,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.brand,
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.cream,
  },

  // Sort button — shows swap icon + short label text
  sortIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 44,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    backgroundColor: COLORS.white,
  },
  sortIconText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.accent,
    textTransform: 'uppercase',
  },

  // ── Bottom sheet chrome ──────────────────────────────────────────
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: COLORS.cream,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
    paddingBottom: 30,
    maxHeight: '65%',
  },
  filterSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.borderLight,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  filterSheetTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  // Section sub-header inside combined filter sheet
  filterSheetSection: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 4,
    marginTop: 4,
  },
  filterSheetScroll: {
    paddingHorizontal: 0,
  },
  filterSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  filterSheetEmoji: {
    fontSize: 16,
  },
  filterSheetLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
  filterSheetLabelActive: {
    color: COLORS.brand,
    fontWeight: '900',
  },
  filterSheetCount: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  filterSheetActions: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  filterSheetClearBtn: {
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  filterSheetClearText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Pet card — neubrutalist with offset shadow ───────────────────
  // cardWrapper provides the positioning context for the shadow layer
  cardWrapper: {
    marginHorizontal: 15,
    marginBottom: 24,
  },
  // Offset shadow sibling — sits behind the card, brand espresso color
  cardShadow: {
    ...SHADOW.card,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
    padding: 16,
  },

  // ── Card header: emoji + name/meta column + edit/delete buttons ──
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  petCardEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  petCardHeaderText: {
    flex: 1,
  },
  petName: {
    fontFamily: FONTS.black,
    fontSize: 20,
    color: COLORS.brand,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  petCardMeta: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.accentLight,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },

  actionRow: { flexDirection: "row", gap: 8 },
  iconBtn: {
    padding: 10,
    backgroundColor: COLORS.white,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
  },

  // ── Thin horizontal divider between rows ─────────────────────────
  petCardDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginBottom: 10,
  },

  // ── Labeled data rows (label left, value right) ──────────────────
  petCardRow: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "flex-start",
  },
  petCardRowLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: 96,
    paddingTop: 1,
  },
  petCardRowContent: {
    flex: 1,
  },
  petCardValue: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.brand,
  },
  petCardValueMuted: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // ── Allergy row — warning tinted surface ─────────────────────────
  allergyRow: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginHorizontal: -4,
    marginBottom: 10,
    alignItems: "center",
  },

  // ── Footer action buttons ────────────────────────────────────────
  footerActions: {
    flexDirection: "row",
    marginTop: 6,
    gap: 10,
    borderTopWidth: 2,
    borderTopColor: COLORS.borderLight,
    paddingTop: 14,
  },
  mainBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 2,
  },
  // Press-snap: translates +4px to "close" the offset shadow gap on press
  btnPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },

  // BOOK VISIT — sky blue fill, brand border
  bookBtn: {
    backgroundColor: COLORS.sky,
    borderColor: COLORS.brand,
  },
  bookBtnText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // VIEW CHART — outlined, sky blue border + text
  chartBtn: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.sky,
  },
  chartBtnText: {
    color: COLORS.sky,
    fontWeight: "900",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // ── Empty state ──────────────────────────────────────────────────
  emptyContainer: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    textAlign: "center",
    color: COLORS.accent,
    fontSize: 20,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  emptySub: {
    color: COLORS.textMuted,
    marginTop: 10,
    textAlign: "center",
    lineHeight: 22,
    fontSize: 15,
  },

  // ── FAB — neubrutalist: zero radius, offset shadow, sky bg ──────
  fabWrapper: {
    position: "absolute",
    bottom: 30,
    right: 20,
  },
  fabShadow: {
    position: "absolute",
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    backgroundColor: COLORS.brand,
  },
  fab: {
    backgroundColor: COLORS.sky,
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
    flexDirection: "row",
    alignItems: "center",
  },
  fabText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 15,
    marginLeft: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
