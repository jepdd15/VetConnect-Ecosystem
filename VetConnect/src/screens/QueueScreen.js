// The Live Lobby.
// Listens to the daily_queue document in real-time, allowing the user to see
// the "Now Serving" number from their phone without crowding the clinic lobby.

import { collection, doc, getDocs, limit, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { COLORS, FONTS, TYPE, SPACING } from "../theme/mobileTokens";
import { getClientStatusLabel, isActiveStatus } from "../utils/statusLabels";

/**
 * Formats a queue ticket as {PREFIX}-{NUMBER} with zero-padded 3-digit number.
 * Matches the canonical format used in SuperCard.js.
 * @param {string|null} prefix
 * @param {number|null} queueNumber
 * @returns {string}
 */
const formatTicket = (prefix, queueNumber) => {
  if (queueNumber == null) return "--";
  const num = String(queueNumber).padStart(3, "0");
  return prefix ? `${prefix}-${num}` : num;
};

export default function QueueScreen() {
  const [queueData, setQueueData] = useState(null);
  const [myTicket, setMyTicket] = useState(null);
  const [allTickets, setAllTickets] = useState([]);
  const [lobbyPatients, setLobbyPatients] = useState([]);
  const [turnAlert, setTurnAlert] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [avgWaitMins, setAvgWaitMins] = useState(null);
  const [lateSent, setLateSent] = useState(false);
  const prevAheadRef = useRef(null);

  // 1. Listen to Global Queue (Now Serving)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "queue", "daily_queue"), (d) => {
      if (d.exists()) setQueueData(d.data());
    });
    return () => unsub();
  }, []);

  // 2. Listen to MY Ticket (waits for auth) -- T2.343 + T2.346
  useEffect(() => {
    let unsubFirestore = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Tear down previous Firestore listener if user changes
      if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }

      if (!user) {
        setMyTicket(null);
        setAllTickets([]);
        return;
      }

      const q = query(
        collection(db, "appointments"),
        where("ownerId", "==", user.uid),
        where("status", "in", [
          "pending", "confirmed", "arrived", "in-consult",
          "dispensing", "billing", "on-hold", "confined",
        ]),
      );

      unsubFirestore = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const sortedDocs = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.queueNumber || 999) - (b.queueNumber || 999));
          setMyTicket(sortedDocs[0]);
          setAllTickets(sortedDocs);
        } else {
          setMyTicket(null);
          setAllTickets([]);
        }
      });
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  // 3. Listen to lobby for wait-time calculation (privacy-scoped) -- T2.345 + T2.347
  useEffect(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const qLobby = query(
      collection(db, "appointments"),
      where("status", "in", [
        "arrived", "in-consult", "dispensing", "billing", "on-hold", "confined",
      ]),
      where("scheduledDate", ">=", startOfDay),
      where("scheduledDate", "<", endOfDay),
    );

    const unsubLobby = onSnapshot(qLobby, (snapshot) => {
      // Strip to calculation-only fields -- no PII leaves this callback
      setLobbyPatients(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            queueNumber: data.queueNumber ?? null,
            serviceDuration: data.serviceDuration ?? null,
            priority: data.priority ?? null,
          };
        })
      );
    });
    return () => unsubLobby();
  }, []);

  // 4. Fetch historical average wait time (one-shot) -- T2.488
  useEffect(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const q = query(
      collection(db, "appointments"),
      where("status", "==", "completed"),
      where("scheduledDate", ">=", sevenDaysAgo),
      limit(100),
    );

    const fetchAvg = async () => {
      try {
        const snapshot = await getDocs(q);
        let totalMins = 0;
        let count = 0;

        snapshot.docs.forEach((d) => {
          const data = d.data();
          const arrived = data.timeArrived?.toDate?.();
          const consultStart = data.timeConsultStarted?.toDate?.();
          if (arrived && consultStart && consultStart > arrived) {
            totalMins += (consultStart - arrived) / 60000;
            count++;
          }
        });

        if (count > 0) {
          setAvgWaitMins(Math.round(totalMins / count));
        }
      } catch {
        // Silently fail -- average is supplementary info
      }
    };

    fetchAvg();
  }, []);

  // Derived: people ahead + estimated wait (memoized) -- T2.349 + T2.350 + T2.352
  const { peopleAhead, estWaitTimeMins } = useMemo(() => {
    if (!myTicket?.queueNumber) return { peopleAhead: 0, estWaitTimeMins: 0 };

    const ahead = lobbyPatients.filter((p) => {
      if (p.priority === "high" && myTicket.priority !== "high") return true;
      if (p.queueNumber && p.queueNumber < myTicket.queueNumber) return true;
      return false;
    });

    let waitMins = 0;
    ahead.forEach((p) => {
      if (p.priority === "high" && p.serviceDuration) {
        waitMins += parseInt(p.serviceDuration, 10) || 60;
      } else if (p.serviceDuration) {
        waitMins += parseInt(p.serviceDuration, 10) || 30;
      } else {
        waitMins += 30;
      }
    });

    return { peopleAhead: ahead.length, estWaitTimeMins: waitMins };
  }, [myTicket, lobbyPatients]);

  // 5. Vibrate + banner when it's the user's turn -- T2.487
  useEffect(() => {
    const shouldAlert =
      prevAheadRef.current !== null &&
      prevAheadRef.current > 0 &&
      peopleAhead <= 0 &&
      myTicket?.queueNumber;

    prevAheadRef.current = peopleAhead;

    if (!shouldAlert) return;

    Vibration.vibrate([0, 400, 200, 400]);
    setTurnAlert(true);
    const timeout = setTimeout(() => setTurnAlert(false), 10000);
    return () => clearTimeout(timeout);
  }, [peopleAhead, myTicket]);

  // 6. Live countdown timer -- T2.485
  useEffect(() => {
    if (estWaitTimeMins <= 0 || !myTicket?.queueNumber) {
      setCountdown(null);
      return;
    }

    setCountdown(estWaitTimeMins);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 60000); // decrement every 60 seconds

    return () => clearInterval(interval);
  }, [estWaitTimeMins, myTicket]);

  // Running Late handler -- T2.490
  const handleRunningLate = async () => {
    if (!myTicket || lateSent) return;

    try {
      await updateDoc(doc(db, "appointments", myTicket.id), {
        isRunningLate: true,
        runningLateAt: new Date(),
      });
      setLateSent(true);
    } catch {
      Alert.alert("Error", "Could not send notification. Please try again.");
    }
  };

  if (!queueData)
    return (
      <ActivityIndicator size="large" color={COLORS.brand} style={{ flex: 1 }} />
    );

  // Format Global Number -- T2.348
  const currentServingDisplay = formatTicket(
    queueData.currentPrefix,
    queueData.currentServing,
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Clinic Queue Monitor</Text>

      {/* Green banner when number is called -- T2.487 */}
      {turnAlert && (
        <View style={styles.turnBanner}>
          <Text style={styles.turnBannerText}>YOUR NUMBER HAS BEEN CALLED!</Text>
        </View>
      )}

      {/* --- GLOBAL DISPLAY --- */}
      <View style={styles.circle}>
        <Text style={styles.label}>Now Serving</Text>
        <Text style={styles.bigNumber}>{currentServingDisplay}</Text>
        <View
          style={[
            styles.statusBadge,
            queueData.status === "active" ? styles.active : styles.paused,
          ]}
        >
          {/* T2.344: guard null status */}
          <Text style={styles.statusText}>
            {(queueData.status || "unknown").toUpperCase()}
          </Text>
        </View>
      </View>

      {/* --- PERSONAL DISPLAY --- */}
      {myTicket ? (
        <View style={styles.myTicketBox}>
          {!myTicket.queueNumber ? (
            <View style={{ alignItems: "center" }}>
              <Text style={styles.ticketLabel}>Appointment Confirmed</Text>
              <Text style={styles.subText}>
                Please proceed to the clinic. Your ticket will be issued upon
                arrival.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.ticketLabel}>Your Ticket Number</Text>
              {/* T2.348: standardized ticket format */}
              <Text style={styles.ticketNumber}>
                {formatTicket(myTicket.ticketPrefix, myTicket.queueNumber)}
              </Text>

              {/* Position progress bar -- T2.484 */}
              {myTicket.queueNumber && lobbyPatients.length > 0 && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(
                            5,
                            Math.min(100, ((lobbyPatients.length - peopleAhead) / lobbyPatients.length) * 100)
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressLabel}>
                    Position {peopleAhead + 1} of {lobbyPatients.length}
                  </Text>
                </View>
              )}

              <View style={styles.infoBox}>
                {/* T2.354: use isActiveStatus for a nuanced turn check */}
                {peopleAhead <= 0 && (isActiveStatus(myTicket.status) || myTicket.status === "confirmed") ? (
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.readyText}>IT'S YOUR TURN!</Text>
                    <Text style={styles.subText}>
                      Please proceed to the consultation room.
                    </Text>
                  </View>
                ) : (
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.waitingText}>Please Wait...</Text>
                    <Text style={styles.subText}>
                      There are{" "}
                      <Text style={{ fontWeight: "bold", color: COLORS.accent }}>
                        {peopleAhead} patient(s)
                      </Text>{" "}
                      ahead of you.
                    </Text>

                    {/* Live countdown estimate -- T2.485 */}
                    <View style={styles.estBox}>
                      <Text style={styles.estLabel}>Estimated Wait Time:</Text>
                      <Text style={styles.estTime}>
                        ~ {countdown != null ? countdown : estWaitTimeMins} min{(countdown ?? estWaitTimeMins) !== 1 ? "s" : ""}
                      </Text>
                    </View>

                    {/* Historical average -- T2.488 */}
                    {avgWaitMins != null && (
                      <Text style={styles.avgWaitText}>
                        Clinic average: ~{avgWaitMins} min wait (last 7 days)
                      </Text>
                    )}
                  </View>
                )}
              </View>

              {/* Running Late button -- T2.490 (confirmed only, pre-arrival) */}
              {myTicket.status === "confirmed" && (
                <TouchableOpacity
                  style={[styles.lateButton, lateSent && styles.lateButtonSent]}
                  onPress={handleRunningLate}
                  disabled={lateSent}
                >
                  <Text style={styles.lateButtonText}>
                    {lateSent ? "CLINIC NOTIFIED" : "I'M RUNNING LATE"}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Multi-pet summary -- T2.489 */}
          {allTickets.length > 1 && (
            <View style={styles.multiPetBox}>
              <Text style={styles.multiPetLabel}>
                ALL YOUR PETS IN QUEUE ({allTickets.length})
              </Text>
              {allTickets.map((ticket, idx) => (
                <View key={ticket.id || idx} style={styles.multiPetRow}>
                  <Text style={styles.multiPetName}>
                    {ticket.petName || `Pet ${idx + 1}`}
                  </Text>
                  <Text style={styles.multiPetTicket}>
                    {formatTicket(ticket.ticketPrefix, ticket.queueNumber)}
                  </Text>
                  <Text style={styles.multiPetStatus}>
                    {getClientStatusLabel(ticket.status)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.noTicketBox}>
          <Text style={styles.noTicketText}>You are not in the queue.</Text>
          <Text style={styles.noTicketSub}>
            Book an appointment to get started.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: SPACING.screenPadding,
    backgroundColor: COLORS.cream,
    alignItems: "center",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.accent,
    marginBottom: 30,
    marginTop: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // "Now Serving" circle -- deliberate design element; keeps borderRadius as visual anchor
  circle: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    borderWidth: 8,
    borderColor: COLORS.brand,
    marginBottom: 40,
  },
  label: {
    fontSize: 16,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bigNumber: { fontSize: 80, fontWeight: "bold", color: COLORS.brand },

  statusBadge: {
    position: "absolute",
    bottom: 30,
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 0,
  },
  active: { backgroundColor: COLORS.success },
  paused: { backgroundColor: COLORS.danger },
  statusText: { color: COLORS.white, fontWeight: "bold", fontSize: 12 },

  // Turn alert banner
  turnBanner: {
    width: "100%",
    backgroundColor: COLORS.success,
    padding: 16,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: COLORS.brand,
    alignItems: "center",
  },
  turnBannerText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 18,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  myTicketBox: {
    width: "100%",
    alignItems: "center",
    padding: SPACING.cardPadding,
    backgroundColor: "#EFEBE9",
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
    elevation: 3,
  },
  ticketLabel: { fontSize: 18, color: COLORS.accent, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1 },
  ticketNumber: {
    fontSize: 60,
    fontWeight: "bold",
    color: COLORS.info,
    marginVertical: 10,
  },

  // Progress bar -- T2.484
  progressContainer: {
    width: "100%",
    marginTop: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  progressTrack: {
    width: "100%",
    height: 12,
    backgroundColor: COLORS.borderLight,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.sky,
  },
  progressLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  infoBox: {
    marginTop: 10,
    width: "100%",
    alignItems: "center",
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  readyText: {
    color: COLORS.success,
    fontWeight: "bold",
    fontSize: 22,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  waitingText: {
    color: COLORS.warning,
    fontWeight: "bold",
    fontSize: 20,
    marginBottom: 5,
  },
  subText: { color: COLORS.accent, textAlign: "center", fontSize: 15 },

  estBox: {
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 0,
    marginTop: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFB74D",
    width: "100%",
  },
  estLabel: {
    fontSize: 12,
    color: COLORS.warning,
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  estTime: { fontSize: 22, color: COLORS.danger, fontWeight: "bold", marginTop: 2 },

  // Historical average -- T2.488
  avgWaitText: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: "center",
    fontStyle: "italic",
  },

  // Running Late button -- T2.490
  lateButton: {
    marginTop: 16,
    padding: 14,
    backgroundColor: COLORS.warning,
    borderWidth: 2,
    borderColor: COLORS.brand,
    alignItems: "center",
    width: "100%",
  },
  lateButtonSent: {
    backgroundColor: COLORS.muted,
  },
  lateButtonText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // Multi-pet section -- T2.489
  multiPetBox: {
    width: "100%",
    marginTop: 16,
    padding: 16,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  multiPetLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.brand,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  multiPetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  multiPetName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.accent,
  },
  multiPetTicket: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.info,
    marginHorizontal: 10,
  },
  multiPetStatus: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.textMuted,
    textTransform: "uppercase",
  },

  noTicketBox: { marginTop: 20, padding: 20, alignItems: "center" },
  noTicketText: { fontSize: 18, fontWeight: "bold", color: COLORS.muted },
  noTicketSub: {
    textAlign: "center",
    color: COLORS.muted,
    marginTop: 5,
    paddingHorizontal: 20,
  },
});
