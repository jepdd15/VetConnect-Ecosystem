import { MaterialIcons } from "@expo/vector-icons";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { auth, db } from "../../firebaseConfig";

export default function MyPetsScreen({ navigation }) {
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("az");

  useEffect(() => {
    const q = query(
      collection(db, "pets"),
      where("ownerId", "==", auth.currentUser.uid),
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const petList = [];
      for (const petDoc of snapshot.docs) {
        const petData = { id: petDoc.id, ...petDoc.data() };
        try {
          const medQ = query(
            collection(db, "medical_records"),
            where("petId", "==", petData.id),
            where("recordType", "==", "medical"),
          );
          const medSnap = await getDocs(medQ);
          if (!medSnap.empty) {
            const records = medSnap.docs.map((d) => d.data());
            records.sort((a, b) => b.date.seconds - a.date.seconds);
            petData.lastVisit = records[0].date;
          }
        } catch (e) {
          console.log(e);
        }
        petList.push(petData);
      }
      setPets(petList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const calculateAge = (dob) => {
    if (!dob) return "Age Not Set";
    try {
      let birthDate;
      if (dob.toDate) birthDate = dob.toDate();
      else birthDate = new Date(dob);
      if (isNaN(birthDate.getTime())) return "Age Not Set";
      const today = new Date();
      let years = today.getFullYear() - birthDate.getFullYear();
      let months = today.getMonth() - birthDate.getMonth();
      if (
        months < 0 ||
        (months === 0 && today.getDate() < birthDate.getDate())
      ) {
        years--;
        months += 12;
      }
      if (years <= 0 && months <= 0) return "Newborn";
      if (years === 0) return `${months} mo`;
      if (months === 0) return `${years} yrs`;
      return `${years} yrs, ${months} mo`;
    } catch (e) {
      return "Age Not Set";
    }
  };

  const handleDelete = async (petId, petName) => {
    Alert.alert(
      "Remove Pet?",
      `Are you sure you want to remove ${petName}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const recordsQuery = query(
                collection(db, "medical_records"),
                where("petId", "==", petId),
              );
              const recordsSnap = await getDocs(recordsQuery);
              if (!recordsSnap.empty) {
                Alert.alert(
                  "Action Blocked",
                  "This pet has existing medical records and cannot be deleted to preserve clinical history. Please contact the clinic to archive this pet's profile.",
                );
                return;
              }
              await deleteDoc(doc(db, "pets", petId));
            } catch (error) {
              Alert.alert("Error", error.message);
            }
          },
        },
      ],
    );
  };

  let processedPets = [...pets].filter((p) => p.status !== "archived");
  if (searchText) {
    const lowerSearch = searchText.toLowerCase();
    processedPets = processedPets.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(lowerSearch)) ||
        (p.breed && p.breed.toLowerCase().includes(lowerSearch)),
    );
  }
  if (speciesFilter !== "All") {
    processedPets = processedPets.filter((p) => {
      if (speciesFilter === "Canine")
        return p.species === "Dog" || p.species === "Canine";
      if (speciesFilter === "Feline")
        return p.species === "Cat" || p.species === "Feline";
      return true;
    });
  }
  if (sortOrder === "az") {
    processedPets.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else {
    processedPets.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }

  const renderPetCard = ({ item }) => {
    let healthStatus = "Up to Date";
    let healthColor = "#2E7D32"; // Green

    if (!item.lastVisit) {
      healthStatus = "Needs Initial Checkup";
      healthColor = "#F57C00"; // Orange
    } else {
      const daysSinceVisit =
        (new Date() - item.lastVisit.toDate()) / (1000 * 60 * 60 * 24);
      if (daysSinceVisit > 365) {
        healthStatus = "Overdue for Annual Exam";
        healthColor = "#D32F2F"; // Red
      }
    }

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.identityBox}>
            <View style={styles.avatarBox}>
              <Text style={styles.avatarEmoji}>
                {item.species === "Canine" || item.species === "Dog"
                  ? "🐶"
                  : "🐱"}
              </Text>
            </View>
            <View>
              <Text style={styles.petName}>{item.name}</Text>
              <Text style={styles.petBreed}>{item.breed || item.species}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={styles.iconBtn}
              android_ripple={{ color: "#ccc", borderless: true }}
              onPress={() => navigation.navigate("EditPet", { pet: item })}
            >
              <MaterialIcons name="edit" size={20} color="#5D4037" />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              android_ripple={{ color: "#FFCDD2", borderless: true }}
              onPress={() => handleDelete(item.id, item.name)}
            >
              <MaterialIcons name="delete-outline" size={20} color="#D32F2F" />
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.healthBanner,
            {
              backgroundColor: `${healthColor}1A`,
              borderLeftColor: healthColor,
            },
          ]}
        >
          <MaterialIcons
            name={healthColor === "#D32F2F" ? "warning-amber" : "verified"}
            size={16}
            color={healthColor}
          />
          <Text style={[styles.healthText, { color: healthColor }]}>
            {healthStatus}
          </Text>
        </View>

        <View style={styles.demoGrid}>
          <View style={styles.demoItem}>
            <Text style={styles.demoLabel}>GENDER</Text>
            <Text style={styles.demoValue}>{item.gender}</Text>
          </View>
          <View style={styles.demoItem}>
            <Text style={styles.demoLabel}>AGE</Text>
            <Text style={styles.demoValue}>{calculateAge(item.dob)}</Text>
          </View>
          <View style={styles.demoItem}>
            <Text style={styles.demoLabel}>STATUS</Text>
            <Text
              style={[
                styles.demoValue,
                { color: item.isNeutered ? "#2E7D32" : "#8B4513" },
              ]}
            >
              {item.isNeutered ? "Desexed" : "Intact"}
            </Text>
          </View>
        </View>

        <View style={styles.alertBox}>
          <Text style={styles.alertLabel}>ALLERGIES: </Text>
          <Text
            style={[
              styles.alertValue,
              item.allergies &&
              item.allergies !== "None" &&
              item.allergies.trim() !== ""
                ? styles.alertRed
                : null,
            ]}
          >
            {item.allergies && item.allergies.trim() !== ""
              ? item.allergies
              : "None reported"}
          </Text>
        </View>

        <View style={styles.footerActions}>
          <TouchableOpacity
            style={[styles.mainBtn, styles.chartBtn]}
            onPress={() =>
              navigation.navigate("PetHistory", {
                petId: item.id,
                petName: item.name,
              })
            }
          >
            <MaterialIcons name="assessment" size={20} color="#1565C0" />
            <Text style={styles.chartBtnText}>View Medical Chart</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.controlBar}>
        <View style={styles.searchContainer}>
          <MaterialIcons
            name="search"
            size={22}
            color="#888"
            style={{ marginLeft: 15 }}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name or breed..."
            placeholderTextColor="#888"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <View style={styles.filterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
          >
            <TouchableOpacity
              style={[
                styles.chip,
                speciesFilter === "All" && styles.chipActive,
              ]}
              onPress={() => setSpeciesFilter("All")}
            >
              <Text
                style={[
                  styles.chipText,
                  speciesFilter === "All" && styles.chipTextActive,
                ]}
              >
                All Pets
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.chip,
                speciesFilter === "Canine" && styles.chipActive,
              ]}
              onPress={() => setSpeciesFilter("Canine")}
            >
              <Text
                style={[
                  styles.chipText,
                  speciesFilter === "Canine" && styles.chipTextActive,
                ]}
              >
                🐶 Dogs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.chip,
                speciesFilter === "Feline" && styles.chipActive,
              ]}
              onPress={() => setSpeciesFilter("Feline")}
            >
              <Text
                style={[
                  styles.chipText,
                  speciesFilter === "Feline" && styles.chipTextActive,
                ]}
              >
                🐱 Cats
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() =>
              setSortOrder((prev) => (prev === "az" ? "newest" : "az"))
            }
          >
            <MaterialIcons
              name={sortOrder === "az" ? "sort-by-alpha" : "update"}
              size={18}
              color="#5D4037"
            />
            <Text style={styles.sortBtnText}>
              {sortOrder === "az" ? " A-Z" : " New"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#8B4513"
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={processedPets}
          keyExtractor={(item) => item.id}
          renderItem={renderPetCard}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 15 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 60, marginBottom: 10 }}>🐾</Text>
              <Text style={styles.emptyText}>
                {searchText || speciesFilter !== "All"
                  ? "No pets match your search."
                  : "No pets added yet."}
              </Text>
              {!searchText && speciesFilter === "All" && (
                <Text style={styles.emptySub}>
                  Register your pet to start tracking their health.
                </Text>
              )}
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("AddPet")}
      >
        <MaterialIcons name="add" size={24} color="white" />
        <Text style={styles.fabText}>Add New Pet</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8E1" },

  controlBar: {
    backgroundColor: "white",
    padding: 15,
    paddingTop: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    marginBottom: 15,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chipScroll: { flex: 1, marginRight: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#F5F5F5",
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#EEEEEE",
  },
  chipActive: {
    backgroundColor: "#5D4037",
    borderColor: "#5D4037",
    elevation: 2,
  },
  chipText: { color: "#757575", fontWeight: "900", fontSize: 13 },
  chipTextActive: { color: "white" },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#EFEBE9",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D7CCC8",
  },
  sortBtnText: {
    color: "#5D4037",
    fontWeight: "900",
    fontSize: 13,
    marginLeft: 4,
  },

  card: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 24,
    marginHorizontal: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    elevation: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  identityBox: { flexDirection: "row", alignItems: "center" },
  avatarBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
    borderWidth: 2,
    borderColor: "#D7CCC8",
    elevation: 2,
  },
  avatarEmoji: { fontSize: 28 },
  petName: { fontSize: 24, fontWeight: "900", color: "#3E2723" },
  petBreed: { fontSize: 14, color: "#888", fontWeight: "600" },

  actionRow: { flexDirection: "row", gap: 10 },
  iconBtn: {
    padding: 10,
    backgroundColor: "white",
    borderRadius: 12,
    elevation: 1,
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden",
  },

  healthBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderLeftWidth: 5,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  healthText: {
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 8,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  demoGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18,
    paddingBottom: 10,
  },
  demoItem: { flex: 1 },
  demoLabel: {
    fontSize: 11,
    color: "#aaa",
    fontWeight: "900",
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  demoValue: { fontSize: 15, color: "#333", fontWeight: "900" },

  alertBox: { flexDirection: "row", paddingHorizontal: 18, paddingBottom: 18 },
  alertLabel: { fontSize: 12, color: "#888", fontWeight: "900" },
  alertValue: { fontSize: 12, color: "#333", fontWeight: "800" },
  alertRed: { color: "#D32F2F" },

  footerActions: { flexDirection: "row", padding: 18, paddingTop: 0, gap: 10 },
  mainBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    elevation: 2,
    gap: 8,
  },
  chartBtn: {
    backgroundColor: "#E3F2FD",
    borderWidth: 1,
    borderColor: "#90CAF9",
  },
  chartBtnText: { color: "#1565C0", fontWeight: "900", fontSize: 15 },

  emptyContainer: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    textAlign: "center",
    color: "#5D4037",
    fontSize: 20,
    fontWeight: "900",
  },
  emptySub: {
    color: "#888",
    marginTop: 10,
    textAlign: "center",
    lineHeight: 22,
    fontSize: 15,
  },

  // THE FIX: Stronger Shadow for a true "Floating" feel!
  fab: {
    position: "absolute",
    bottom: 30,
    right: 20,
    backgroundColor: "#8B4513",
    paddingVertical: 18,
    paddingHorizontal: 25,
    borderRadius: 30,
    elevation: 8,
    shadowColor: "#8B4513",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  fabText: { color: "white", fontWeight: "900", fontSize: 16, marginLeft: 8 },
});
