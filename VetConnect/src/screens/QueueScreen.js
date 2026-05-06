// The Live Lobby.
// Listens to the daily_queue document in real-time, allowing the user to see
// the "Now Serving" number from their phone without crowding the clinic lobby.

import { collection, doc, getDocs, limit, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigation } from "@react-navigation/native";
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
import { useNetwork } from "../context/NetworkContext";
import { getClientStatusLabel, isActiveStatus } from "../utils/statusLabels";

/**
 * Breadcrumb stages shown on QueueScreen. Each maps an appointment status
 * to a client-friendly label. Derived from buildVisitTimeline.js CLIENT_LABEL_MAP.
 * The order represents the typical happy-path clinic visit flow.
 */
const BREADCRUMB_STAGES = [
  { status: 'confirmed',  label: 'Confirmed' },
  { status: 'arrived',    label: 'Checked in' },
  { status: 'in-consult', label: 'With the vet' },
  { status: 'dispensing', label: 'Pharmacy' },
  { status: 'billing',    label: 'Checkout' },
  { status: 'completed',  label: 'Done' },
];

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
  const navigation = useNavigation();
  const [queueData, setQueueData] = useState(null);
  const [myTicket, setMyTicket] = useState(null);
  const [allTickets, setAllTickets] = useState([]);
  const [lobbyPatients, setLobbyPatients] = useState([]);
  const [turnAlert, setTurnAlert] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [avgWaitMins, setAvgWaitMins] = useState(null);
  const [deptAvgConsultMins, setDeptAvgConsultMins] = useState({});  // T4.134: per-dept avg consult durations
  const [departments, setDepartments] = useState([]);                 // T4.134: department color/name config
  const [lateSent, setLateSent] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const prevAheadRef = useRef(null);
  const { isConnected } = useNetwork();

  // 1. Listen to Global Queue (Now Serving)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "queue", "daily_queue"),
      (d) => {
        if (d.exists()) setQueueData(d.data());
        setLastUpdated(new Date());
      },
      (error) => {
        console.warn("[QueueScreen] Queue data error:", error.message);
      },
    );
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

      unsubFirestore = onSnapshot(
        q,
        (snapshot) => {
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
        },
        (error) => {
          console.warn("[QueueScreen] My ticket error:", error.message);
        },
      );
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

    const unsubLobby = onSnapshot(
      qLobby,
      (snapshot) => {
        // Strip to calculation-only fields -- no PII leaves this callback
        setLobbyPatients(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              queueNumber: data.queueNumber ?? null,
              serviceDuration: data.serviceDuration ?? null,
              serviceType: data.serviceType ?? null,
              serviceCategory: data.serviceCategory ?? null,   // T4.134: department lane filtering
              priority: data.priority ?? null,
            };
          })
        );
      },
      (error) => {
        console.warn("[QueueScreen] Lobby error:", error.message);
      },
    );
    return () => unsubLobby();
  }, []);

  // 4. Fetch per-department avg consult duration (one-shot) — T4.134 (absorbs T4.6 + T2.488)
  useEffect(() => {
    const fetchAvg = async () => {
      try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const q = query(
          collection(db, "appointments"),
          where("status", "==", "completed"),
          where("scheduledDate", ">=", startOfDay),
          limit(200),
        );
        const snapshot = await getDocs(q);

        // Group completed consult durations by department
        const deptBuckets = {};
        let globalTotal = 0;
        let globalCount = 0;

        snapshot.docs.forEach((d) => {
          const data = d.data();
          const started = data.timeStarted?.toDate?.();
          const completed = data.timeCompleted?.toDate?.();
          if (started && completed && completed > started) {
            const mins = (completed - started) / 60000;
            const dept = data.serviceCategory || "General";
            if (!deptBuckets[dept]) deptBuckets[dept] = { total: 0, count: 0 };
            deptBuckets[dept].total += mins;
            deptBuckets[dept].count++;
            globalTotal += mins;
            globalCount++;
          }
        });

        const result = {};
        Object.entries(deptBuckets).forEach(([dept, bucket]) => {
          result[dept] = Math.round(bucket.total / bucket.count);
        });

        // __global is the fallback for departments with no data today
        const globalAvg = globalCount > 0 ? Math.round(globalTotal / globalCount) : null;
        result.__global = globalAvg;

        setDeptAvgConsultMins(result);
        // Backward compat: keep avgWaitMins for the "Clinic average" fallback line
        setAvgWaitMins(globalAvg);
      } catch {
        // Silently fail — average is supplementary info
      }
    };

    fetchAvg();
  }, []);

  // 4.5 Fetch departments collection (one-shot) — T4.134: department colors + lane labels
  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const snap = await getDocs(collection(db, "departments"));
        setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        // Department colors are cosmetic — fail silently
      }
    };
    fetchDepts();
  }, []);

  // Derived: people ahead + estimated wait + per-service breakdown (memoized)
  // T2.349 + T2.350 + T2.352 + T3.59 + T4.134 (dept-filtered counts + per-dept avg wait)
  const { peopleAhead, estWaitTimeMins, serviceBreakdown, myDepartment } = useMemo(() => {
    if (!myTicket?.queueNumber) {
      return { peopleAhead: 0, estWaitTimeMins: 0, serviceBreakdown: [], myDepartment: null };
    }

    // T4.134: the client's department lane — filters who counts as "ahead"
    const myDept = myTicket?.serviceCategory || null;

    const ahead = lobbyPatients.filter((p) => {
      // T4.134: skip patients in a different department — they don't share staff
      if (myDept && p.serviceCategory && p.serviceCategory !== myDept) return false;
      if (p.priority === "high" && myTicket.priority !== "high") return true;
      if (p.queueNumber && p.queueNumber < myTicket.queueNumber) return true;
      return false;
    });

    // T4.134: use per-department avg consult duration for wait estimate
    let waitMins = 0;
    ahead.forEach((p) => {
      const pDept = p.serviceCategory || myDept || "General";
      const pAvg = deptAvgConsultMins[pDept] || deptAvgConsultMins.__global || 30;
      // Prefer declared service duration; fall back to dept historical average
      waitMins += parseInt(p.serviceDuration, 10) || pAvg;
    });

    // T3.59: Group ahead patients by serviceType for breakdown display
    const typeMap = {};
    ahead.forEach((p) => {
      const type = p.serviceType || "Other";
      if (!typeMap[type]) typeMap[type] = { count: 0, totalMins: 0 };
      typeMap[type].count += 1;
      const pDept = p.serviceCategory || myDept || "General";
      const pAvg = deptAvgConsultMins[pDept] || deptAvgConsultMins.__global || 30;
      typeMap[type].totalMins += parseInt(p.serviceDuration, 10) || pAvg;
    });

    const breakdown = Object.entries(typeMap)
      .map(([serviceType, data]) => ({ serviceType, count: data.count, totalMins: data.totalMins }))
      .sort((a, b) => b.count - a.count);

    return { peopleAhead: ahead.length, estWaitTimeMins: waitMins, serviceBreakdown: breakdown, myDepartment: myDept };
  }, [myTicket, lobbyPatients, deptAvgConsultMins]);

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

  // T4.134: resolve department color from Firestore departments collection
  const myDeptObj = departments.find(
    d => d.name?.toLowerCase() === (myTicket?.serviceCategory || '').toLowerCase()
  );
  const deptColor = myDeptObj?.color || COLORS.sky;

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

      {/* Offline staleness indicator — only visible when offline and data has been loaded */}
      {!isConnected && lastUpdated && (
        <Text style={styles.staleNote}>
          LAST UPDATED: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}

      {/* --- PERSONAL DISPLAY --- */}
      {myTicket ? (
        <View style={styles.myTicketBox}>
          {!myTicket.queueNumber ? (
            <View style={{ alignItems: "center" }}>
              <Text style={styles.ticketLabel}>Appointment Confirmed</Text>
              <Text style={styles.subText}>
                Scan the clinic QR code to check in and receive your ticket.
              </Text>
              <TouchableOpacity
                style={[styles.lateButton, { backgroundColor: COLORS.sky, marginTop: 16 }]}
                onPress={() => navigation.navigate('SelfCheckIn')}
              >
                <Text style={styles.lateButtonText}>SCAN TO CHECK IN</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.ticketLabel}>Your Ticket Number</Text>
              {/* T2.348: standardized ticket format */}
              <Text style={styles.ticketNumber}>
                {formatTicket(myTicket.ticketPrefix, myTicket.queueNumber)}
              </Text>

              {/* T4.134: department lane label — tells the owner which queue they are in */}
              {myDepartment && (
                <View style={styles.deptLaneBox}>
                  <View style={[styles.deptDot, { backgroundColor: deptColor }]} />
                  <Text style={styles.deptLaneText}>
                    YOUR QUEUE: {myDepartment.toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Position progress bar -- T2.484 */}
              {myTicket.queueNumber != null && lobbyPatients.length > 0 && (
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

              {/* Status breadcrumb — T4.134, Phase 5 */}
              {myTicket.status && (() => {
                // on-hold and confined both occur during the consult phase;
                // map them to in-consult so the breadcrumb highlights correctly
                const breadcrumbStatus = ['on-hold', 'confined'].includes(myTicket.status)
                  ? 'in-consult'
                  : myTicket.status;
                const currentIdx = BREADCRUMB_STAGES.findIndex(s => s.status === breadcrumbStatus);
                if (currentIdx < 0) return null;

                // Lead-in line to current dot is green (optimistic: patient reached this stage).
                // Trailing line from current dot is gray (stage not yet completed).
                return (
                  <>
                    <View style={styles.breadcrumbContainer}>
                      {BREADCRUMB_STAGES.map((stage, idx) => {
                        const isPast    = idx < currentIdx;
                        const isCurrent = idx === currentIdx;
                        const isLast    = idx === BREADCRUMB_STAGES.length - 1;

                        return (
                          <View key={stage.status} style={styles.breadcrumbStep}>
                            <View style={styles.breadcrumbDotRow}>
                              {idx > 0 && (
                                <View style={[
                                  styles.breadcrumbLine,
                                  (isPast || isCurrent) ? styles.breadcrumbLineActive : styles.breadcrumbLineInactive,
                                ]} />
                              )}
                              <View style={[
                                styles.breadcrumbDot,
                                isPast    && { backgroundColor: COLORS.success },
                                isCurrent && { backgroundColor: COLORS.sky },
                                !isPast && !isCurrent && { backgroundColor: COLORS.borderLight },
                              ]} />
                              {!isLast && (
                                <View style={[
                                  styles.breadcrumbLine,
                                  isPast ? styles.breadcrumbLineActive : styles.breadcrumbLineInactive,
                                ]} />
                              )}
                            </View>
                            <Text style={[
                              styles.breadcrumbLabel,
                              isPast    && { color: COLORS.success },
                              isCurrent && { color: COLORS.sky, fontWeight: '900' },
                            ]} numberOfLines={1}>
                              {stage.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Sub-state annotation for on-hold / confined */}
                    {(myTicket.status === 'on-hold' || myTicket.status === 'confined') && (
                      <Text style={styles.breadcrumbNote}>
                        {myTicket.status === 'on-hold' ? 'Currently on hold' : 'Admitted to clinic'}
                      </Text>
                    )}
                  </>
                );
              })()}

              <View style={styles.infoBox}>
                {/* T2.354: use isActiveStatus for a nuanced turn check */}
                {peopleAhead <= 0 && (isActiveStatus(myTicket.status) || myTicket.status === "confirmed") ? (
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.readyText}>IT&apos;S YOUR TURN!</Text>
                    <Text style={styles.subText}>
                      Please proceed to the consultation room.
                    </Text>
                  </View>
                ) : (
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.waitingText}>Please Wait...</Text>
                    {/* T4.134: department-filtered ahead count + explainer (Phase 6) */}
                    <View style={styles.aheadRow}>
                      <Text style={styles.subText}>
                        There are{" "}
                        <Text style={{ fontWeight: "bold", color: COLORS.accent }}>
                          {peopleAhead} patient(s)
                        </Text>{" "}
                        ahead of you{myDepartment ? ` in ${myDepartment}` : ""}.
                      </Text>
                      <TouchableOpacity
                        style={styles.infoButton}
                        onPress={() =>
                          Alert.alert(
                            "How the Queue Works",
                            "Pets may be seen in a different order based on the type of service. " +
                            "Grooming, veterinary consultations, and vaccinations are handled by " +
                            "different staff at the same time.\n\n" +
                            "Your position shows how many pets are ahead of you for the same type " +
                            "of service. A lower ticket number in another department does not " +
                            "affect your wait.",
                            [{ text: "Got it" }]
                          )
                        }
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.infoIcon}>i</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Live countdown estimate -- T2.485 */}
                    <View style={styles.estBox}>
                      <Text style={styles.estLabel}>Estimated Wait Time:</Text>
                      <Text style={styles.estTime}>
                        ~ {countdown != null ? countdown : estWaitTimeMins} min{(countdown ?? estWaitTimeMins) !== 1 ? "s" : ""}
                      </Text>
                    </View>

                    {/* T3.59: Per-service-type breakdown — only shown when 2+ distinct types are ahead */}
                    {serviceBreakdown.length > 1 && (
                      <View style={styles.breakdownBox}>
                        {/* T4.134: show dept name when known */}
                        <Text style={styles.breakdownLabel}>
                          {myDepartment ? `Ahead in ${myDepartment}:` : "By Service Type:"}
                        </Text>
                        {serviceBreakdown.map((item, idx) => (
                          <View key={item.serviceType} style={[styles.breakdownRow, idx === serviceBreakdown.length - 1 && { borderBottomWidth: 0 }]}>
                            <Text style={styles.breakdownService} numberOfLines={1}>
                              {item.serviceType}
                            </Text>
                            <Text style={styles.breakdownCount}>
                              {item.count} ahead
                            </Text>
                            <Text style={styles.breakdownTime}>
                              ~{item.totalMins}m wait
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* T4.134: department-specific avg, falling back to clinic-wide (absorbs T2.488) */}
                    {myDepartment && deptAvgConsultMins[myDepartment] ? (
                      <Text style={styles.avgWaitText}>
                        Avg {myDepartment.toLowerCase()} visit: ~{deptAvgConsultMins[myDepartment]} min (today)
                      </Text>
                    ) : avgWaitMins != null ? (
                      <Text style={styles.avgWaitText}>
                        Clinic average: ~{avgWaitMins} min wait (today)
                      </Text>
                    ) : null}
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

  // T3.59: Service-type breakdown below aggregate estimate
  breakdownBox: {
    width: "100%",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  breakdownLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  breakdownService: {
    flex: 1,
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.accent,
  },
  breakdownCount: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.muted,
    marginHorizontal: 8,
  },
  breakdownTime: {
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.warning,
    minWidth: 40,
    textAlign: "right",
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

  // Offline staleness indicator — shown below the Now Serving circle when offline
  staleNote: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // T4.134: Department lane label — shown below ticket number
  deptLaneBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
    gap: 8,
  },
  // borderRadius: 6 is a deliberate exception — circular dept indicator dot
  deptDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  deptLaneText: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.accent,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },

  // T4.134 Phase 5 — Status breadcrumb
  breadcrumbContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    width: "100%",
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  breadcrumbStep: {
    flex: 1,
    alignItems: "center",
  },
  breadcrumbDotRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 16,
    width: "100%",
    justifyContent: "center",
  },
  // borderRadius: 6 is a deliberate exception — circular stage indicator dot
  breadcrumbDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  breadcrumbLine: {
    flex: 1,
    height: 2,
  },
  breadcrumbLineActive: {
    backgroundColor: COLORS.success,
  },
  breadcrumbLineInactive: {
    backgroundColor: COLORS.borderLight,
  },
  breadcrumbLabel: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
    textAlign: "center",
    color: COLORS.muted,
  },
  breadcrumbNote: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.warning,
    textAlign: "center",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // T4.134 Phase 6 — "Why was I skipped?" info button
  aheadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  // borderRadius: 11 is a deliberate exception — circular info button
  infoButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  infoIcon: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.sky,
    lineHeight: 15,
  },
});
