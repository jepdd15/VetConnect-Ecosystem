/**
 * NotificationHistory.js — T4.119
 *
 * Dedicated notification history screen for pet owners. Displays all past
 * push notifications from the notification_log collection in a date-grouped
 * SectionList with type-filter chips, color-coded icons, and infinite scroll.
 *
 * On mount, writes lastNotificationReadAt to the user doc to clear the
 * unread badge on ClientDashboard.
 */

import {
  collection, doc, getDocs, limit, orderBy, query, startAfter,
  Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { auth, db } from '../../firebaseConfig';
import { COLORS, FONTS, SPACING } from '../theme/mobileTokens';

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 30;

/** Maps notification_log.type values to filter chip labels */
const FILTER_CHIPS = [
  { key: 'all',      label: 'ALL' },
  { key: 'status',   label: 'APPOINTMENTS' },
  { key: 'custom',   label: 'MESSAGES' },
  { key: 'reminder', label: 'REMINDERS' },
];

/** Maps notification_log.type to a MaterialIcons icon name and color */
const TYPE_ICON_MAP = {
  status:   { icon: 'event',       color: '#1565C0' }, // blue — appointments
  custom:   { icon: 'chat-bubble', color: '#6A1B9A' }, // purple — messages
  reminder: { icon: 'vaccines',    color: '#2E7D32' }, // green — vaccine reminders
};
const DEFAULT_ICON = { icon: 'notifications', color: COLORS.accentLight }; // generic bell

// ─── Date grouping helpers ────────────────────────────────────────────────────
function getDateGroupLabel(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= today)     return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo)   return 'This Week';
  return 'Earlier';
}

function groupByDate(items) {
  const groups = {};
  const order = ['Today', 'Yesterday', 'This Week', 'Earlier'];

  items.forEach((item) => {
    const label = getDateGroupLabel(item._date);
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });

  return order
    .filter((label) => groups[label]?.length > 0)
    .map((label) => ({ title: label, data: groups[label] }));
}

// ─── Relative timestamp formatter ────────────────────────────────────────────
function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24)  return `${diffHr} hr${diffHr > 1 ? 's' : ''} ago`;

  // Absolute for older
  return date.toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NotificationHistory({ navigation }) {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [filteredSections, setFilteredSections] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const lastDocRef = useRef(null);

  // ── Mark notifications as read on mount ─────────────────────────────────
  useEffect(() => {
    if (!auth.currentUser) return;
    updateDoc(doc(db, 'users', auth.currentUser.uid), {
      lastNotificationReadAt: Timestamp.now(),
    }).catch((err) =>
      console.log('[NotificationHistory] Failed to update read marker:', err.message)
    );
  }, []);

  // ── Fetch first page ───────────────────────────────────────────────────
  useEffect(() => {
    fetchPage(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPage = useCallback(async (append = false) => {
    if (!auth.currentUser) return;
    append ? setLoadingMore(true) : setLoading(true);

    try {
      const constraints = [
        where('ownerId', '==', auth.currentUser.uid),
        orderBy('sentAt', 'desc'),
        limit(PAGE_SIZE + 1), // +1 sentinel for has-more detection
      ];
      if (append && lastDocRef.current) {
        constraints.push(startAfter(lastDocRef.current));
      }

      const snap = await getDocs(query(collection(db, 'notification_log'), ...constraints));
      const fetched = snap.docs.map((d) => {
        const data = d.data();
        const ts = data.sentAt;
        const jsDate = ts?.toDate
          ? ts.toDate()
          : new Date(ts?.seconds ? ts.seconds * 1000 : 0);
        return { id: d.id, ...data, _date: jsDate };
      });

      const hasNext = fetched.length > PAGE_SIZE;
      if (hasNext) fetched.pop(); // Remove sentinel

      // Update cursor to the last real document fetched
      lastDocRef.current = snap.docs[fetched.length - 1] ?? null;

      setNotifications((prev) => append ? [...prev, ...fetched] : fetched);
      setHasMore(hasNext);
    } catch (err) {
      console.log('[NotificationHistory] Fetch error:', err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-group whenever notifications or active filter changes ──────────
  useEffect(() => {
    const filtered = activeFilter === 'all'
      ? notifications
      : notifications.filter((n) => {
          if (activeFilter === 'reminder') {
            return n.type === 'reminder' || n.type === 'vaccine-reminder' || n.type === 'appointment-reminder' || n.type === 'balance-reminder';
          }
          return n.type === activeFilter;
        });
    setFilteredSections(groupByDate(filtered));
  }, [notifications, activeFilter]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleItemPress = (item) => {
    if (item.appointmentId) {
      navigation.navigate('ClientAppointments');
    } else {
      // Toggle expand/collapse for non-appointment notifications
      setExpandedId((prev) => (prev === item.id ? null : item.id));
    }
  };

  const handleEndReached = () => {
    if (hasMore && !loadingMore && !loading) {
      fetchPage(true);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────
  const renderSectionHeader = ({ section }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title.toUpperCase()}</Text>
    </View>
  );

  const renderItem = ({ item }) => {
    const typeConfig = TYPE_ICON_MAP[item.type] ?? DEFAULT_ICON;
    const isExpanded = expandedId === item.id;
    const hasAppointment = !!item.appointmentId;

    return (
      <TouchableOpacity
        onPress={() => handleItemPress(item)}
        activeOpacity={0.85}
        style={styles.itemContainer}
      >
        <View style={styles.itemShadow} />
        <View style={styles.itemCard}>
          {/* Type icon */}
          <View style={[styles.iconBox, { borderColor: typeConfig.color }]}>
            <MaterialIcons name={typeConfig.icon} size={20} color={typeConfig.color} />
          </View>

          {/* Content */}
          <View style={styles.itemContent}>
            {/* Title row */}
            <View style={styles.itemTitleRow}>
              <Text style={styles.itemTitle} numberOfLines={isExpanded ? 0 : 1}>
                {item.title || 'Notification'}
              </Text>
              {hasAppointment && (
                <MaterialIcons name="chevron-right" size={20} color={COLORS.accentLight} />
              )}
            </View>

            {/* Body */}
            <Text style={styles.itemBody} numberOfLines={isExpanded ? 0 : 2}>
              {item.body || 'No details available.'}
            </Text>

            {/* Pet name + timestamp row */}
            <View style={styles.itemMeta}>
              {item.petName && (
                <Text style={styles.itemPetName}>{item.petName}</Text>
              )}
              <Text style={styles.itemTimestamp}>
                {formatRelativeTime(item._date)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="notifications-none" size={64} color={COLORS.muted} />
        <Text style={styles.emptyTitle}>NO NOTIFICATIONS YET</Text>
        <Text style={styles.emptyBody}>
          You&apos;ll see appointment updates and messages here.
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={COLORS.sky} />
        <Text style={styles.footerText}>LOADING MORE...</Text>
      </View>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {/* FILTER CHIPS */}
      <View style={styles.chipRowContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRowContent}
        >
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilter === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => setActiveFilter(chip.key)}
                style={[styles.chip, isActive && styles.chipActive]}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* LOADING STATE */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.sky} />
          <Text style={styles.loadingText}>LOADING NOTIFICATIONS...</Text>
        </View>
      )}

      {/* NOTIFICATION LIST */}
      {!loading && (
        <SectionList
          sections={filteredSections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          stickySectionHeadersEnabled
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 20) + 40 }]}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },

  // Filter chips
  chipRowContainer: {
    backgroundColor: COLORS.cream,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.borderLight,
  },
  chipRowContent: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: COLORS.brand,
    backgroundColor: COLORS.white,
    borderRadius: 0,
  },
  chipActive: {
    backgroundColor: COLORS.brand,
  },
  chipText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.brand,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chipTextActive: {
    color: COLORS.white,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.accentLight,
    letterSpacing: 1,
  },

  // Section headers
  sectionHeader: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  sectionHeaderText: {
    fontFamily: FONTS.black,
    fontSize: 13,
    color: COLORS.accentLight,
    letterSpacing: 1.2,
  },

  // List
  listContent: {
    paddingBottom: 40,
  },

  // Notification items
  itemContainer: {
    position: 'relative',
    marginHorizontal: SPACING.screenPadding,
    marginTop: 12,
  },
  itemShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 14,
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderWidth: 2,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cream,
  },
  itemContent: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  itemTitle: {
    fontFamily: FONTS.black,
    fontSize: 14,
    color: COLORS.brand,
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  itemBody: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.accent,
    lineHeight: 18,
    marginBottom: 6,
  },
  itemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemPetName: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.sky,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemTimestamp: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    letterSpacing: 0.5,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: FONTS.black,
    fontSize: 18,
    color: COLORS.brand,
    letterSpacing: 0.5,
  },
  emptyBody: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.accentLight,
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // Footer loader
  footerLoader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  footerText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    letterSpacing: 0.8,
  },
});
