// screens/HomeScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  Animated,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { Text, Avatar, Chip } from 'react-native-paper';
import { useAuth } from '../utils/authHelpers';
import FileUploadModal from '../components/FileUploadModal';
import PhotoInspectionModal from '../components/PhotoInspectionModal';
import { getPendingSubmissionsCount, syncPendingSubmissions } from '../utils/offlineSync';
import NetInfo from '@react-native-community/netinfo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Metro Train SVG-style component ──────────────────────────────────────────
function MetroTrain({ animValue }) {
  const carCount = 3;
  const CAR_W = 90;
  const CAR_H = 38;
  const CAR_GAP = 4;
  const NOSE_W = 22;

  return (
    <Animated.View
      style={{
        transform: [{ translateX: animValue }],
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {/* Nose / cab */}
      <View style={styles.trainNose}>
        <View style={styles.trainWindowSmall} />
        <View style={styles.trainWindowSmall} />
        <View style={styles.headlight} />
      </View>

      {Array.from({ length: carCount }).map((_, i) => (
        <View key={i} style={[styles.trainCar, i === carCount - 1 && styles.trainCarLast]}>
          {/* Windows row */}
          <View style={styles.trainWindowRow}>
            {[0, 1, 2, 3].map(w => (
              <View key={w} style={styles.trainWindow} />
            ))}
          </View>
          {/* Doors */}
          <View style={styles.trainDoorRow}>
            <View style={styles.trainDoor} />
            <View style={styles.trainDoor} />
          </View>
          {/* Undercarriage */}
          <View style={styles.undercarriage}>
            <View style={styles.wheel} />
            <View style={styles.wheel} />
            <View style={styles.wheel} />
            <View style={styles.wheel} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

// ── Track / Scene component ───────────────────────────────────────────────────
function MetroScene() {
  const trainX = useRef(new Animated.Value(-400)).current;
  const platformLightsOpacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const runAnimation = () => {
      // Reset position
      trainX.setValue(-420);

      Animated.sequence([
        // Lights pulse as train approaches
        Animated.timing(platformLightsOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        // Train rushes through
        Animated.timing(trainX, {
          toValue: SCREEN_WIDTH + 50,
          duration: 2200,
          useNativeDriver: true,
        }),
        // Lights dim after
        Animated.timing(platformLightsOpacity, {
          toValue: 0.4,
          duration: 500,
          useNativeDriver: true,
        }),
        // Pause before repeat
        Animated.delay(3500),
      ]).start(({ finished }) => {
        if (finished) runAnimation();
      });
    };

    const timer = setTimeout(runAnimation, 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.metroScene}>
      {/* Sky gradient background */}
      <View style={styles.sceneSky} />

      {/* Platform lights */}
      <Animated.View style={[styles.platformLights, { opacity: platformLightsOpacity }]}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={styles.platformLight} />
        ))}
      </Animated.View>

      {/* Track lines */}
      <View style={styles.trackContainer}>
        <View style={styles.rail} />
        <View style={[styles.rail, { top: 8 }]} />
        {/* Sleepers */}
        {Array.from({ length: 14 }).map((_, i) => (
          <View
            key={i}
            style={[styles.sleeper, { left: (SCREEN_WIDTH / 14) * i }]}
          />
        ))}
      </View>

      {/* Platform edge */}
      <View style={styles.platformEdge}>
        <View style={styles.yellowLine} />
      </View>

      {/* Overhead wire */}
      <View style={styles.overheadWire} />
      {/* Catenary poles */}
      {[0.2, 0.5, 0.8].map((pos, i) => (
        <View key={i} style={[styles.pole, { left: SCREEN_WIDTH * pos }]} />
      ))}

      {/* Train */}
      <MetroTrain animValue={trainX} />

      {/* Scene label */}
      <View style={styles.sceneLabelContainer}>
        <Text style={styles.sceneLabel}>KOCHI METRO · KMRL</Text>
      </View>
    </View>
  );
}

// ── Action Button ─────────────────────────────────────────────────────────────
function ActionButton({ icon, label, subtitle, onPress, accent, outlined }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
        style={[
          styles.actionButton,
          outlined ? styles.actionButtonOutlined : null,
          accent ? { borderColor: accent, borderWidth: 1 } : null,
        ]}
      >
        <View style={[styles.actionIconBox, accent ? { backgroundColor: accent + '22' } : null]}>
          <Text style={[styles.actionIcon, accent ? { color: accent } : null]}>{icon}</Text>
        </View>
        <View style={styles.actionTextBox}>
          <Text style={styles.actionLabel}>{label}</Text>
          {subtitle ? <Text style={styles.actionSubtitle}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.actionChevron}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Feature Badge ─────────────────────────────────────────────────────────────
function FeatureBadge({ icon, label, desc }) {
  return (
    <View style={styles.featureBadge}>
      <Text style={styles.featureBadgeIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureBadgeLabel}>{label}</Text>
        <Text style={styles.featureBadgeDesc}>{desc}</Text>
      </View>
    </View>
  );
}

// ── Main HomeScreen ───────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    checkPendingSubmissions();

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
      if (state.isConnected && pendingCount > 0) handleManualSync();
    });
    return () => unsubscribe();
  }, []);

  const checkPendingSubmissions = async () => {
    const count = await getPendingSubmissionsCount();
    setPendingCount(count);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const result = await syncPendingSubmissions();
      if (result.successful > 0) {
        alert(`Synced ${result.successful} submission(s) successfully`);
        checkPendingSubmissions();
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const handleBulkUploadSuccess = () => {
    alert('Bulk upload completed successfully!');
    checkPendingSubmissions();
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1e" />
      <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerGreeting}>
                {getGreeting()}, {(user?.displayName || 'Inspector').split(' ')[0]}
              </Text>
              <Text style={styles.headerSub}>{user?.email}</Text>
            </View>
          </View>

          {/* Status row */}
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, { backgroundColor: isOnline ? '#00e87622' : '#ff4d4f22' }]}>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? '#00e876' : '#ff4d4f' }]} />
              <Text style={[styles.statusText, { color: isOnline ? '#00e876' : '#ff4d4f' }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>

            {pendingCount > 0 && (
              <TouchableOpacity
                style={styles.syncPill}
                onPress={handleManualSync}
                disabled={!isOnline || syncing}
              >
                <Text style={styles.syncText}>
                  {syncing ? '⟳ Syncing...' : `⟳ ${pendingCount} pending`}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.kmrlBadge}>
              <Text style={styles.kmrlBadgeText}>KMRL</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Metro Animation Scene ───────────────────────────────────── */}
        <MetroScene />

        {/* ── Quick Actions ───────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>

          <ActionButton
            icon="🚆"
            label="New Train Induction"
            subtitle="Log induction form for KMRL fleet"
            onPress={() => navigation.navigate('InductionForm')}
            accent="#3b82f6"
          />
          <ActionButton
            icon="📷"
            label="Photo Inspection (AI)"
            subtitle="Defect detection via camera"
            onPress={() => setPhotoModalVisible(true)}
            accent="#f97316"
          />
          <ActionButton
            icon="📁"
            label="Bulk Upload"
            subtitle="Import via CSV or XML file"
            onPress={() => setUploadModalVisible(true)}
            accent="#8b5cf6"
          />
          <ActionButton
            icon="📋"
            label="View History"
            subtitle="Past submissions & reports"
            onPress={() => alert('Coming soon!')}
          />
          <ActionButton
            icon="📊"
            label="Analytics"
            subtitle="Fleet performance overview"
            onPress={() => alert('Coming soon!')}
          />
        </View>

        {/* ── System Features ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SYSTEM CAPABILITIES</Text>
          <View style={styles.featuresCard}>
            <FeatureBadge icon="🤖" label="AI-Driven Scheduling" desc="Predictive maintenance & optimal induction timing" />
            <View style={styles.featureDivider} />
            <FeatureBadge icon="📡" label="Real-time IoT Sync" desc="Mileage, brake wear & HVAC sensor data" />
            <View style={styles.featureDivider} />
            <FeatureBadge icon="🌐" label="Web Dashboard" desc="Live data on the KMRL web portal" />
            <View style={styles.featureDivider} />
            <FeatureBadge icon="📶" label="Offline Support" desc="Forms work without internet connection" />
            <View style={styles.featureDivider} />
            <FeatureBadge icon="🔍" label="Photo AI Inspection" desc="Defect detection from train part photos" />
          </View>
        </View>

        {/* ── Logout ──────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={signOut} activeOpacity={0.8}>
            <Text style={styles.logoutButtonIcon}>⏻</Text>
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Tasks')}>
            <Text>My Tasks</Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Kochi Metro Rail Limited · KMRL</Text>
          <Text style={styles.footerSub}>AI-Driven Train Induction System v2.0</Text>
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('InductionForm')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <FileUploadModal
        visible={uploadModalVisible}
        onDismiss={() => setUploadModalVisible(false)}
        onSuccess={handleBulkUploadSuccess}
      />
      <PhotoInspectionModal
        visible={photoModalVisible}
        onDismiss={() => setPhotoModalVisible(false)}
        onSuccess={() => alert('Photo inspection completed!')}
      />
    </>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Styles ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0f1e',
  surface: '#111827',
  surface2: '#1a2235',
  border: '#1e2d45',
  accent: '#3b82f6',
  accentGlow: '#3b82f622',
  text: '#f0f4ff',
  textMuted: '#6b7fa3',
  textDim: '#3d506b',
  trainBody: '#1c3a6e',
  trainAccent: '#2563eb',
  trainWindow: '#7dd3fc',
  trainWindowDark: '#1e40af',
  rail: '#1e3a5f',
  platform: '#0f1c2e',
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
    backgroundColor: C.bg,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  headerGreeting: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: '#2a1f1f',
    gap: 10,
  },
  logoutButtonIcon: {
    fontSize: 18,
    color: '#ef4444',
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ef4444',
    letterSpacing: 0.3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  syncPill: {
    backgroundColor: '#f59e0b22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  syncText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
  },
  kmrlBadge: {
    marginLeft: 'auto',
    backgroundColor: C.accentGlow,
    borderColor: C.accent,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
  },
  kmrlBadgeText: {
    color: C.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // ── Metro Scene
  metroScene: {
    height: 130,
    backgroundColor: '#060d1a',
    marginHorizontal: 0,
    marginBottom: 24,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  sceneSky: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 60,
    backgroundColor: '#060d1a',
  },
  overheadWire: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#1e3a5f',
    opacity: 0.8,
  },
  pole: {
    position: 'absolute',
    top: 10,
    width: 2,
    height: 55,
    backgroundColor: '#1e3a5f',
  },
  platformLights: {
    position: 'absolute',
    top: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  platformLight: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fde68a',
    shadowColor: '#fde68a',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  trackContainer: {
    position: 'absolute',
    bottom: 22,
    left: 0,
    right: 0,
    height: 14,
  },
  rail: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#1e4a7a',
    borderRadius: 2,
  },
  sleeper: {
    position: 'absolute',
    bottom: -2,
    width: 18,
    height: 8,
    backgroundColor: '#0e2540',
    borderRadius: 1,
  },
  platformEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: '#0d1b2e',
    borderTopWidth: 2,
    borderTopColor: '#1e3a5f',
  },
  yellowLine: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#fbbf24',
    opacity: 0.6,
  },
  sceneLabelContainer: {
    position: 'absolute',
    bottom: 4,
    right: 10,
  },
  sceneLabel: {
    color: '#1e3a5f',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
  },

  // ── Train
  trainNose: {
    width: 22,
    height: 38,
    backgroundColor: C.trainBody,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 8,
    borderRightWidth: 1,
    borderRightColor: C.trainAccent,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingTop: 4,
    gap: 3,
    overflow: 'hidden',
    shadowColor: '#3b82f6',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  trainWindowSmall: {
    width: 8,
    height: 6,
    backgroundColor: C.trainWindow,
    borderRadius: 2,
    opacity: 0.85,
  },
  headlight: {
    position: 'absolute',
    bottom: 5,
    right: 3,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fde68a',
    shadowColor: '#fde68a',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  trainCar: {
    width: 90,
    height: 38,
    backgroundColor: C.trainBody,
    borderRightWidth: 1,
    borderRightColor: '#0a1628',
    borderTopWidth: 2,
    borderTopColor: C.trainAccent,
    justifyContent: 'flex-start',
    paddingTop: 4,
    overflow: 'visible',
  },
  trainCarLast: {
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  trainWindowRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 5,
    marginBottom: 2,
  },
  trainWindow: {
    width: 14,
    height: 10,
    backgroundColor: C.trainWindow,
    borderRadius: 2,
    opacity: 0.75,
  },
  trainDoorRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 18,
  },
  trainDoor: {
    width: 12,
    height: 10,
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 1,
    backgroundColor: '#0f2040',
  },
  undercarriage: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    position: 'absolute',
    bottom: -5,
    left: 0,
    right: 0,
  },
  wheel: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2d3f5a',
    borderWidth: 1,
    borderColor: '#4b6080',
  },

  // ── Sections
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: C.textMuted,
    marginBottom: 12,
  },

  // ── Action Buttons
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionButtonOutlined: {
    backgroundColor: 'transparent',
  },
  actionIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionIcon: {
    fontSize: 20,
    color: C.text,
  },
  actionTextBox: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    letterSpacing: 0.2,
  },
  actionSubtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
  actionChevron: {
    fontSize: 22,
    color: C.textDim,
    marginLeft: 8,
  },

  // ── Features Card
  featuresCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  featureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  featureBadgeIcon: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  featureBadgeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  featureBadgeDesc: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 1,
  },
  featureDivider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 14,
  },

  // ── Footer
  footer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  footerText: {
    fontSize: 11,
    color: C.textDim,
    fontWeight: '600',
    letterSpacing: 1,
  },
  footerSub: {
    fontSize: 10,
    color: C.textDim,
    marginTop: 3,
    letterSpacing: 0.5,
  },

  // ── FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
});