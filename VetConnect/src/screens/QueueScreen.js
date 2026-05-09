// The Live Lobby.
// Listens to the daily_queue document in real-time, allowing the user to see
// the "Now Serving" number from their phone without crowding the clinic lobby.

import { collection, doc, getDocs, limit, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { COLORS, FONTS, TYPE, SPACING, SHADOW } from "../theme/mobileTokens";
import { useNetwork } from "../context/NetworkContext";
import { isActiveStatus } from "../utils/statusLabels";

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

const getStageMessage = (status) => {
  switch (status) {
    case 'arrived':
    case 'confirmed':
      return "You're checked in! A veterinarian will be with your pet shortly.";
    case 'in-consult':
      return "Your pet is being attended to right now. We'll update you on next steps when they're done.";
    case 'dispensing':
      return "Almost done! Your pet's medications are being prepared. Next: checkout.";
    case 'billing':
      return "Your pet is ready to go home! We're preparing your bill now.";
    case 'confined':
      return 'Your pet is resting comfortably under our care. Call us anytime for updates.';
    case 'on-hold':
      return "The vet has paused briefly — we'll resume shortly.";
    default:
      return "Hang tight — we'll call your number soon.";
  }
};

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
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
  const [elapsedMins, setElapsedMins] = useState(null);
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
              ticketPrefix: data.ticketPrefix ?? null,
              serviceDuration: data.serviceDuration ?? null,
              serviceType: data.serviceType ?? null,
              serviceCategory: data.serviceCategory ?? null,
              priority: data.priority ?? null,
              status: data.status ?? null,
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

  // Derived: people ahead + estimated wait + per-service breakdown + per-dept breakdown (memoized)
  // T2.349 + T2.350 + T2.352 + T3.59 + T4.134 + T4.178
  const { peopleAhead, estWaitTimeMins, serviceBreakdown, myDepartment, deptBreakdown, bottleneck } = useMemo(() => {
    if (!myTicket?.queueNumber) {
      return { peopleAhead: 0, estWaitTimeMins: 0, serviceBreakdown: [], myDepartment: null, deptBreakdown: [], bottleneck: null };
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

    // T4.178: per-department breakdown for multi-department appointments
    const myDepts = myTicket.services?.length > 0
      ? [...new Set(myTicket.services.map(s => s.serviceCategory || s.department || myDept).filter(Boolean))]
      : (myDept ? [myDept] : []);

    const deptBreakdownArr = myDepts.map(dept => {
      const deptAhead = lobbyPatients.filter(p => {
        if (p.status && !['arrived', 'in-consult', 'dispensing', 'billing', 'on-hold'].includes(p.status)) return false;
        if (p.serviceCategory && p.serviceCategory !== dept) return false;
        if (p.priority === 'high' && myTicket.priority !== 'high') return true;
        if (p.queueNumber && p.queueNumber < myTicket.queueNumber) return true;
        return false;
      });
      const deptAvg = deptAvgConsultMins[dept] || deptAvgConsultMins.__global || 30;
      let deptWait = 0;
      deptAhead.forEach(p => {
        deptWait += parseInt(p.serviceDuration, 10) || deptAvg;
      });
      return { department: dept, ahead: deptAhead.length, waitMins: deptWait };
    });

    const bottleneckDept = deptBreakdownArr.length > 0
      ? deptBreakdownArr.reduce((max, d) => d.waitMins > max.waitMins ? d : max, deptBreakdownArr[0])
      : null;

    return {
      peopleAhead: ahead.length,
      estWaitTimeMins: waitMins,
      serviceBreakdown: breakdown,
      myDepartment: myDept,
      deptBreakdown: deptBreakdownArr,
      bottleneck: bottleneckDept,
    };
  }, [myTicket, lobbyPatients, deptAvgConsultMins]);

  // T4.178: per-department "Now Serving" from lobby data (replaces single-lane daily_queue circle)
  const nowServingByDept = useMemo(() => {
    const serving = lobbyPatients.filter(p =>
      ['in-consult', 'dispensing', 'billing', 'on-hold'].includes(p.status)
    );
    const byDept = {};
    serving.forEach(p => {
      const dept = p.serviceCategory || 'General';
      if (!byDept[dept]) byDept[dept] = [];
      byDept[dept].push(p);
    });
    Object.values(byDept).forEach(arr =>
      arr.sort((a, b) => (a.queueNumber || 999) - (b.queueNumber || 999))
    );
    return byDept;
  }, [lobbyPatients]);

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

  useEffect(() => {
    if (!myTicket?.timeArrived) {
      setElapsedMins(null);
      return;
    }

    const computeElapsed = () => {
      try {
        const arrived = typeof myTicket.timeArrived?.toDate === 'function'
          ? myTicket.timeArrived.toDate()
          : myTicket.timeArrived instanceof Date
            ? myTicket.timeArrived
            : new Date(myTicket.timeArrived);
        if (isNaN(arrived.getTime())) { setElapsedMins(null); return; }
        const mins = Math.max(0, Math.round((Date.now() - arrived.getTime()) / 60000));
        setElapsedMins(mins);
      } catch {
        setElapsedMins(null);
      }
    };

    computeElapsed();
    const interval = setInterval(computeElapsed, 60000);
    return () => clearInterval(interval);
  }, [myTicket?.timeArrived]);

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

  // T4.134: resolve department color from Firestore departments collection
  const myDeptObj = departments.find(
    d => d.name?.toLowerCase() === (myTicket?.serviceCategory || '').toLowerCase()
  );
  const deptColor = myDeptObj?.color || COLORS.sky;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) + 40 }]}>
      {/* Green banner when number is called -- T2.487 */}
      {turnAlert && (
        <View style={styles.turnBanner}>
          <Text style={styles.turnBannerText}>YOUR NUMBER HAS BEEN CALLED!</Text>
        </View>
      )}

      {/* --- PERSONAL TICKET HERO --- */}
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
              <Text style={styles.ticketNumber}>
                {formatTicket(myTicket.ticketPrefix, myTicket.queueNumber)}
              </Text>

              {myTicket.petName && (
                <Text style={styles.heroSubtitle}>{myTicket.petName}</Text>
              )}

              {myTicket.services?.length > 0 ? (
                <Text style={styles.heroServices}>
                  {myTicket.services.map(s => s.serviceName || s.serviceType).join(' + ')}
                </Text>
              ) : myTicket.serviceType ? (
                <Text style={styles.heroServices}>{myTicket.serviceType}</Text>
              ) : null}

              {/* T4.197: Compact per-service progress strip for multi-service appointments */}
              {(myTicket.services?.length ?? 0) >= 2 &&
                myTicket.services.some(s => s.serviceStatus && s.serviceStatus !== 'pending') && (
                <Text style={styles.serviceStrip}>
                  {myTicket.services.map(s => {
                    const st = s.serviceStatus || 'pending';
                    const icon = st === 'completed' ? '✓' : st === 'in-progress' ? '⏳' : '○';
                    return `${icon} ${s.serviceName || s.name || s.serviceType || 'Service'}`;
                  }).join(' · ')}
                </Text>
              )}

              {myTicket.assignedVet && myTicket.assignedVet !== 'Unassigned' && (
                <Text style={styles.heroVet}>{myTicket.assignedVet}</Text>
              )}

              {/* T4.134: department lane label */}
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

              {/* Status breadcrumb — two rows of 3, T4.134 + T4.178 */}
              {myTicket.status && (() => {
                const breadcrumbStatus = ['on-hold', 'confined'].includes(myTicket.status)
                  ? 'in-consult'
                  : myTicket.status;
                const currentIdx = BREADCRUMB_STAGES.findIndex(s => s.status === breadcrumbStatus);
                if (currentIdx < 0) return null;

                const renderRow = (stages, startIdx) => (
                  <View style={styles.breadcrumbContainer}>
                    {stages.map((stage, rowIdx) => {
                      const idx = rowIdx + startIdx;
                      const isPast    = idx < currentIdx;
                      const isCurrent = idx === currentIdx;
                      const isLast    = rowIdx === stages.length - 1;
                      return (
                        <View key={stage.status} style={styles.breadcrumbStep}>
                          <View style={styles.breadcrumbDotRow}>
                            {rowIdx > 0 && (
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
                );

                return (
                  <>
                    {renderRow(BREADCRUMB_STAGES.slice(0, 3), 0)}
                    {renderRow(BREADCRUMB_STAGES.slice(3), 3)}

                    {(myTicket.status === 'on-hold' || myTicket.status === 'confined') && (
                      <Text style={styles.breadcrumbNote}>
                        {myTicket.status === 'on-hold' ? 'Currently on hold' : 'Admitted to clinic'}
                      </Text>
                    )}
                  </>
                );
              })()}

              <View style={styles.infoBox}>
                {peopleAhead <= 0 && (isActiveStatus(myTicket.status) || myTicket.status === "confirmed") ? (
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.readyText}>
                      {['dispensing', 'billing'].includes(myTicket.status)
                        ? 'NEXT STEP'
                        : "IT'S YOUR TURN!"}
                    </Text>
                    <Text style={styles.subText}>
                      {getStageMessage(myTicket.status)}
                    </Text>
                  </View>
                ) : (
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.waitingText}>Please Wait...</Text>
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
                      {(countdown ?? estWaitTimeMins ?? 1) <= 0 ? (
                        <>
                          <Text style={styles.estLabel}>HANG TIGHT</Text>
                          <Text style={styles.estTime}>Almost there</Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.estLabel}>Estimated Wait Time:</Text>
                          <Text style={styles.estTime}>
                            ~ {countdown != null ? countdown : estWaitTimeMins} min{(countdown ?? estWaitTimeMins) !== 1 ? "s" : ""}
                          </Text>
                        </>
                      )}
                      {elapsedMins != null && (
                        <View style={styles.elapsedRow}>
                          <Text style={styles.elapsedLabel}>WAITING FOR</Text>
                          <Text style={[
                            styles.elapsedValue,
                            elapsedMins > (estWaitTimeMins || Infinity) && { color: COLORS.danger },
                          ]}>
                            {elapsedMins} min{elapsedMins !== 1 ? 's' : ''}
                          </Text>
                          {estWaitTimeMins != null && elapsedMins > estWaitTimeMins && (
                            <Text style={styles.elapsedOverrun}>
                              ~{elapsedMins - estWaitTimeMins} min over estimate
                            </Text>
                          )}
                        </View>
                      )}
                    </View>

                    {/* T4.178: multi-department bottleneck headline + per-dept breakdown */}
                    {deptBreakdown.length > 1 && bottleneck && (
                      <Text style={styles.bottleneckHeadline}>
                        Longest wait: {bottleneck.department} (~{bottleneck.waitMins} min)
                      </Text>
                    )}

                    {deptBreakdown.length > 1 && (
                      <View style={styles.deptBreakdownBox}>
                        {deptBreakdown.map((d) => {
                          const isBottleneck = d.department === bottleneck?.department;
                          return (
                            <View key={d.department} style={styles.deptBreakdownRow}>
                              <Text style={styles.deptBreakdownName}>{d.department}</Text>
                              <Text style={styles.deptBreakdownCount}>{d.ahead} ahead</Text>
                              <Text style={[
                                styles.deptBreakdownTime,
                                isBottleneck && { color: COLORS.danger },
                              ]}>
                                ~{d.waitMins}m{isBottleneck ? ' (bottleneck)' : ''}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* T3.59: Per-service-type breakdown — only shown when 2+ distinct types are ahead */}
                    {deptBreakdown.length <= 1 && serviceBreakdown.length > 1 && (
                      <View style={styles.breakdownBox}>
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
        </View>
      ) : (
        <View style={styles.noTicketBox}>
          <Text style={styles.noTicketText}>You are not in the queue.</Text>
          <Text style={styles.noTicketSub}>
            Book an appointment to get started.
          </Text>
          <View style={styles.bookNowWrapper}>
            <View style={SHADOW.button} />
            <TouchableOpacity
              style={styles.bookNowBtn}
              onPress={() => navigation.navigate('BookAppointment')}
              activeOpacity={0.9}
            >
              <Text style={styles.bookNowText}>BOOK NOW</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* --- PER-DEPARTMENT NOW SERVING --- */}
      <View style={styles.nowServingSection}>
        <Text style={styles.nowServingHeader}>NOW SERVING</Text>
        <View style={[styles.statusBadge, queueData.status === "active" ? styles.active : styles.paused]}>
          <Text style={styles.statusText}>
            {(queueData.status || "unknown").toUpperCase()}
          </Text>
        </View>
        {Object.keys(nowServingByDept).length > 0 ? (
          Object.entries(nowServingByDept).map(([dept, patients]) => {
            const deptObj = departments.find(
              d => d.name?.toLowerCase() === dept.toLowerCase()
            );
            const color = deptObj?.color || COLORS.sky;
            const firstServing = patients[0];
            return (
              <View key={dept} style={styles.nowServingRow}>
                <View style={[styles.deptDot, { backgroundColor: color }]} />
                <Text style={styles.nowServingDept}>{dept.toUpperCase()}</Text>
                <Text style={styles.nowServingTicket}>
                  {formatTicket(firstServing.ticketPrefix, firstServing.queueNumber)}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.nowServingEmpty}>Waiting for next patient</Text>
        )}
      </View>

      {/* Offline staleness indicator */}
      {!isConnected && lastUpdated && (
        <Text style={styles.staleNote}>
          LAST UPDATED: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
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
  nowServingSection: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    padding: SPACING.cardPadding,
    marginTop: 20,
    marginBottom: 8,
    alignItems: 'center',
  },
  nowServingHeader: {
    fontFamily: FONTS.black,
    fontSize: 14,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  nowServingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  nowServingDept: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nowServingTicket: {
    fontFamily: FONTS.black,
    fontSize: 28,
    color: COLORS.brand,
  },
  nowServingEmpty: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  statusBadge: {
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 0,
    marginBottom: 8,
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
    backgroundColor: COLORS.cream,
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
  heroSubtitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  heroServices: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.accent,
    textAlign: 'center',
    marginTop: 4,
  },
  heroVet: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  // T4.197: Compact service-progress strip below service names
  serviceStrip: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.accent,
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.3,
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
    backgroundColor: COLORS.cream,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 0,
    marginTop: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.warning,
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

  bottleneckHeadline: {
    fontFamily: FONTS.black,
    fontSize: 14,
    color: COLORS.danger,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    textAlign: 'center',
  },
  deptBreakdownBox: {
    width: '100%',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  deptBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  deptBreakdownName: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.accent,
    textTransform: 'uppercase',
  },
  deptBreakdownCount: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.muted,
    marginHorizontal: 8,
  },
  deptBreakdownTime: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.warning,
    minWidth: 80,
    textAlign: 'right',
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

  noTicketBox: { marginTop: 20, padding: 20, alignItems: "center" },
  noTicketText: { fontSize: 18, fontWeight: "bold", color: COLORS.muted },
  noTicketSub: {
    textAlign: "center",
    color: COLORS.muted,
    marginTop: 5,
    paddingHorizontal: 20,
  },
  bookNowWrapper: { position: 'relative', marginTop: 20, width: 200 },
  bookNowBtn: {
    backgroundColor: COLORS.sky,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderWidth: 3,
    borderColor: COLORS.brand,
    alignItems: 'center',
  },
  bookNowText: {
    fontFamily: FONTS.black,
    fontSize: 18,
    color: COLORS.textOnSky,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },

  elapsedRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  elapsedLabel: { fontSize: 11, fontWeight: '900', color: COLORS.textMuted, letterSpacing: 1 },
  elapsedValue: { fontSize: 18, fontWeight: '900', color: COLORS.brand },
  elapsedOverrun: { fontSize: 11, fontWeight: '700', color: COLORS.danger, marginLeft: 4 },

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
