// screens/ProfileScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    StatusBar,
    Animated,
    TextInput as RNTextInput,
    Platform,
    Alert,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import {
    doc,
    getDoc,
    updateDoc,
    getFirestore,
    collection,
    query,
    where,
    getDocs,
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useAuth } from '../utils/authHelpers';
import { useLanguage, SUPPORTED_LANGUAGES } from '../utils/i18n/LanguageContext';
import { getPendingSubmissionsCount } from '../utils/offlineSync';

const db = getFirestore();

// ─── Colour palette (matches app theme) ──────────────────────────────────────
const C = {
    bg: '#0a0f1e',
    surface: '#111827',
    surface2: '#1a2235',
    surface3: '#0d1424',
    border: '#1e2d45',
    accent: '#3b82f6',
    accentDim: '#3b82f622',
    accentSoft: '#1e3a5f',
    text: '#f0f4ff',
    textMuted: '#6b7fa3',
    textDim: '#3d506b',
    success: '#4ade80',
    successBg: '#052e16',
    warning: '#fbbf24',
    warningBg: '#451a03',
    error: '#f87171',
    errorBg: '#450a0a',
    purple: '#a78bfa',
    purpleBg: '#2e1065',
};

const DEPT_ICONS = {
    Electrical: '⚡',
    Mechanical: '⚙️',
    Cleaning: '🧹',
    Operations: '🚇',
    Safety: '🛡️',
    IT: '💻',
};

// ─── Reusable editable row ────────────────────────────────────────────────────
function EditableField({ label, value, onSave, icon, editable = true }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef(null);

    const handleEdit = () => {
        setDraft(value);
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 80);
    };

    const handleSave = () => {
        setEditing(false);
        if (draft.trim() !== value) onSave(draft.trim());
    };

    const handleCancel = () => {
        setDraft(value);
        setEditing(false);
    };

    return (
        <View style={ef.row}>
            <View style={ef.iconWrap}>
                <Text style={ef.icon}>{icon}</Text>
            </View>
            <View style={ef.body}>
                <Text style={ef.label}>{label}</Text>
                {editing ? (
                    <View style={ef.inputRow}>
                        <RNTextInput
                            ref={inputRef}
                            value={draft}
                            onChangeText={setDraft}
                            style={ef.input}
                            placeholderTextColor={C.textDim}
                            onSubmitEditing={handleSave}
                            returnKeyType="done"
                        />
                        <TouchableOpacity onPress={handleSave} style={ef.saveBtn}>
                            <Text style={ef.saveBtnText}>✓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleCancel} style={ef.cancelBtn}>
                            <Text style={ef.cancelBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <Text style={ef.value} numberOfLines={1}>{value || '—'}</Text>
                )}
            </View>
            {editable && !editing && (
                <TouchableOpacity onPress={handleEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={ef.editIcon}>✎</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const ef = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: C.border },
    iconWrap: { width: 36, alignItems: 'center', marginRight: 14 },
    icon: { fontSize: 18 },
    body: { flex: 1 },
    label: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: C.textDim, textTransform: 'uppercase', marginBottom: 3 },
    value: { fontSize: 15, color: C.text, fontWeight: '500' },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: { flex: 1, color: C.text, fontSize: 15, borderBottomWidth: 1.5, borderBottomColor: C.accent, paddingVertical: 2, paddingHorizontal: 0 },
    editIcon: { fontSize: 16, color: C.textDim, paddingLeft: 8 },
    saveBtn: { backgroundColor: C.accentSoft, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.accent },
    saveBtnText: { color: C.accent, fontSize: 14, fontWeight: '700' },
    cancelBtn: { paddingHorizontal: 6, paddingVertical: 4 },
    cancelBtnText: { color: C.textDim, fontSize: 14 },
});

// ─── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ value, label, color, bg }) {
    return (
        <View style={[sp.pill, { backgroundColor: bg, borderColor: color }]}>
            <Text style={[sp.value, { color }]}>{value}</Text>
            <Text style={sp.label}>{label}</Text>
        </View>
    );
}

const sp = StyleSheet.create({
    pill: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, marginHorizontal: 4 },
    value: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    label: { fontSize: 10, color: C.textMuted, fontWeight: '600', marginTop: 2, textAlign: 'center' },
});

// ─── Language Switcher (large, for the profile page) ─────────────────────────
function ProfileLanguageSwitcher() {
    const { language, setLanguage } = useLanguage();

    return (
        <View style={ls.container}>
            {SUPPORTED_LANGUAGES.map(lang => {
                const active = language === lang.code;
                return (
                    <TouchableOpacity
                        key={lang.code}
                        onPress={() => setLanguage(lang.code)}
                        activeOpacity={0.75}
                        style={[ls.btn, active && ls.btnActive]}
                    >
                        <Text style={[ls.native, active && ls.nativeActive]}>{lang.nativeLabel}</Text>
                        <Text style={[ls.english, active && ls.englishActive]}>{lang.label}</Text>
                        {active && <View style={ls.dot} />}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const ls = StyleSheet.create({
    container: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingVertical: 16 },
    btn: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface3 },
    btnActive: { borderColor: C.accent, backgroundColor: C.accentSoft },
    native: { fontSize: 17, fontWeight: '700', color: C.textDim, marginBottom: 3 },
    nativeActive: { color: C.text },
    english: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, color: C.textDim, textTransform: 'uppercase' },
    englishActive: { color: C.textMuted },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent, marginTop: 6 },
});

// ─── Section card wrapper ─────────────────────────────────────────────────────
function Section({ title, icon, children }) {
    return (
        <View style={sc.card}>
            <View style={sc.header}>
                <Text style={sc.icon}>{icon}</Text>
                <Text style={sc.title}>{title}</Text>
            </View>
            {children}
        </View>
    );
}

const sc = StyleSheet.create({
    card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16, overflow: 'hidden' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
    icon: { fontSize: 16 },
    title: { fontSize: 11, fontWeight: '800', letterSpacing: 2, color: C.textMuted, textTransform: 'uppercase' },
});

// ─── Avatar initials ──────────────────────────────────────────────────────────
function Avatar({ name, size = 72 }) {
    const initials = (name || 'U')
        .split(' ')
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <View style={[av.circle, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={[av.text, { fontSize: size * 0.36 }]}>{initials}</Text>
        </View>
    );
}

const av = StyleSheet.create({
    circle: { backgroundColor: C.accentSoft, borderWidth: 2, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' },
    text: { color: C.accent, fontWeight: '800', letterSpacing: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen({ navigation }) {
    const { user, signOut } = useAuth();
    const { t, language } = useLanguage();

    const [profile, setProfile] = useState(null);
    const [submissionCount, setSubCount] = useState(0);
    const [taskCounts, setTaskCounts] = useState({ total: 0, done: 0 });
    const [pendingSync, setPendingSync] = useState(0);
    const [saving, setSaving] = useState(false);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(24)).current;

    // ── Load profile + stats on mount ──────────────────────────────────────────
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
        ]).start();

        loadAll();
    }, []);

    const loadAll = async () => {
        if (!user) return;
        try {
            // Firestore user doc
            const snap = await getDoc(doc(db, 'users', user.uid));
            if (snap.exists()) setProfile(snap.data());

            // Submission count
            const subSnap = await getDocs(
                query(collection(db, 'trainDailyData'), where('userId', '==', user.uid))
            );
            setSubCount(subSnap.size);

            // Task counts
            const taskSnap = await getDocs(
                query(collection(db, 'tasks'), where('assignedTo', '==', user.uid))
            );
            const tasks = taskSnap.docs.map(d => d.data());
            setTaskCounts({ total: tasks.length, done: tasks.filter(t => t.status === 'completed').length });

            // Pending offline queue
            const pending = await getPendingSubmissionsCount();
            setPendingSync(pending);
        } catch (e) {
            console.error('Profile load error:', e);
        }
    };

    // ── Field save handlers ─────────────────────────────────────────────────────
    const updateField = async (field, value) => {
        if (!user) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), { [field]: value });
            setProfile(prev => ({ ...prev, [field]: value }));
            // Also update Firebase Auth displayName if changing name
            if (field === 'displayName') {
                await updateProfile(auth.currentUser, { displayName: value });
            }
        } catch (e) {
            Alert.alert('Error', 'Could not save change: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSignOut = () => {
        Alert.alert(
            t('profile.signOutTitle'),
            t('profile.signOutMessage'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('home.signOut'), style: 'destructive', onPress: signOut },
            ]
        );
    };

    const displayName = profile?.displayName || user?.displayName || 'Inspector';
    const deptIcon = DEPT_ICONS[profile?.department] || '🏢';
    const joinDate = profile?.createdAt?.toDate
        ? profile.createdAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
    const lastLogin = profile?.lastLoginAt?.toDate
        ? profile.lastLoginAt.toDate().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '—';

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

                    {/* ── Hero card ──────────────────────────────────────────────── */}
                    <View style={styles.hero}>
                        {/* Decorative background arcs */}
                        <View style={styles.heroBg1} />
                        <View style={styles.heroBg2} />

                        <Avatar name={displayName} size={82} />

                        <Text style={styles.heroName}>{displayName}</Text>
                        <View style={styles.heroBadgeRow}>
                            <View style={styles.heroBadge}>
                                <Text style={styles.heroBadgeText}>{deptIcon}  {profile?.department || 'KMRL Staff'}</Text>
                            </View>
                            {profile?.role === 'admin' && (
                                <View style={[styles.heroBadge, { borderColor: C.warning, backgroundColor: C.warningBg }]}>
                                    <Text style={[styles.heroBadgeText, { color: C.warning }]}>★  Admin</Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.heroEmail}>{user?.email}</Text>

                        {/* Saving indicator */}
                        {saving && <Text style={styles.savingText}>saving…</Text>}
                    </View>

                    {/* ── Stats row ─────────────────────────────────────────────── */}
                    <View style={styles.statsRow}>
                        <StatPill value={submissionCount} label={t('profile.stats.submissions')} color={C.accent} bg={C.accentDim} />
                        <StatPill value={taskCounts.done} label={t('profile.stats.tasksDone')} color={C.success} bg={C.successBg} />
                        <StatPill value={pendingSync} label={t('profile.stats.pendingSync')} color={C.warning} bg={C.warningBg} />
                    </View>

                    {/* ── Account info ──────────────────────────────────────────── */}
                    <Section title={t('profile.sections.account')} icon="👤">
                        <EditableField
                            label={t('profile.fields.name')}
                            value={profile?.displayName || user?.displayName || ''}
                            icon="🪪"
                            onSave={v => updateField('displayName', v)}
                        />
                        <EditableField
                            label={t('profile.fields.email')}
                            value={profile?.email || user?.email || ''}
                            icon="✉️"
                            editable={false}
                        />
                        <EditableField
                            label={t('profile.fields.phone')}
                            value={profile?.phone || ''}
                            icon="📱"
                            onSave={v => updateField('phone', v)}
                        />
                        <EditableField
                            label={t('profile.fields.department')}
                            value={`${deptIcon}  ${profile?.department || '—'}`}
                            icon="🏢"
                            editable={false}
                        />
                    </Section>

                    {/* ── System info ───────────────────────────────────────────── */}
                    <Section title={t('profile.sections.system')} icon="🔧">
                        <EditableField label={t('profile.fields.role')} value={profile?.role || 'user'} icon="🎖️" editable={false} />
                        <EditableField label={t('profile.fields.joined')} value={joinDate} icon="📅" editable={false} />
                        <EditableField label={t('profile.fields.lastLogin')} value={lastLogin} icon="🕐" editable={false} />
                        <EditableField label={t('profile.fields.appType')} value={profile?.appType || 'mobile'} icon="📲" editable={false} />
                    </Section>

                    {/* ── Language ──────────────────────────────────────────────── */}
                    <Section title={t('profile.sections.language')} icon="🌐">
                        <ProfileLanguageSwitcher />
                        <View style={styles.langNote}>
                            <Text style={styles.langNoteText}>{t('profile.languageNote')}</Text>
                        </View>
                    </Section>

                    {/* ── Preferences (future hooks) ────────────────────────────── */}
                    <Section title={t('profile.sections.preferences')} icon="⚙️">
                        <View style={styles.prefRow}>
                            <Text style={styles.prefIcon}>🔔</Text>
                            <Text style={styles.prefLabel}>{t('profile.prefs.notifications')}</Text>
                            <View style={styles.prefComingSoon}><Text style={styles.prefComingSoonText}>{t('profile.prefs.soon')}</Text></View>
                        </View>
                        <View style={[styles.prefRow, { borderBottomWidth: 0 }]}>
                            <Text style={styles.prefIcon}>🌙</Text>
                            <Text style={styles.prefLabel}>{t('profile.prefs.darkMode')}</Text>
                            <View style={styles.prefComingSoon}><Text style={styles.prefComingSoonText}>{t('profile.prefs.soon')}</Text></View>
                        </View>
                    </Section>

                    {/* ── Sign out ──────────────────────────────────────────────── */}
                    <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
                        <Text style={styles.signOutIcon}>⏻</Text>
                        <Text style={styles.signOutText}>{t('home.signOut')}</Text>
                    </TouchableOpacity>

                    {/* ── Footer ────────────────────────────────────────────────── */}
                    <Text style={styles.footer}>KMRL · Train Induction System v2.0</Text>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    scroll: { padding: 16, paddingTop: 12, paddingBottom: 60 },

    // Hero
    hero: {
        alignItems: 'center',
        backgroundColor: C.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.border,
        paddingTop: 36,
        paddingBottom: 28,
        marginBottom: 12,
        overflow: 'hidden',
        position: 'relative',
    },
    heroBg1: {
        position: 'absolute', top: -40, right: -40,
        width: 160, height: 160, borderRadius: 80,
        backgroundColor: C.accentDim,
    },
    heroBg2: {
        position: 'absolute', top: -20, left: -30,
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: '#1e2d4520',
    },
    heroName: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 14, letterSpacing: 0.3 },
    heroBadgeRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 6 },
    heroBadge: {
        paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
        borderWidth: 1, borderColor: C.accent, backgroundColor: C.accentDim,
    },
    heroBadgeText: { fontSize: 12, fontWeight: '700', color: C.accent, letterSpacing: 0.3 },
    heroEmail: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    savingText: { fontSize: 10, color: C.textDim, marginTop: 8, letterSpacing: 1 },

    // Stats
    statsRow: { flexDirection: 'row', marginBottom: 16 },

    // Language note
    langNote: { paddingHorizontal: 18, paddingBottom: 14 },
    langNoteText: { fontSize: 11, color: C.textDim, letterSpacing: 0.3, lineHeight: 16 },

    // Preferences
    prefRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 18, paddingVertical: 15,
        borderBottomWidth: 1, borderBottomColor: C.border,
        gap: 14,
    },
    prefIcon: { fontSize: 18, width: 26, textAlign: 'center' },
    prefLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: C.text },
    prefComingSoon: {
        backgroundColor: C.surface2, borderRadius: 6,
        paddingHorizontal: 8, paddingVertical: 3,
        borderWidth: 1, borderColor: C.border,
    },
    prefComingSoonText: { fontSize: 9, fontWeight: '700', color: C.textDim, letterSpacing: 1, textTransform: 'uppercase' },

    // Sign out
    signOutBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: C.surface, borderRadius: 16,
        paddingVertical: 15, marginBottom: 16,
        borderWidth: 1, borderColor: '#2a1f1f',
        gap: 10,
    },
    signOutIcon: { fontSize: 18, color: C.error },
    signOutText: { fontSize: 15, fontWeight: '700', color: C.error, letterSpacing: 0.3 },

    footer: {
        textAlign: 'center', fontSize: 10,
        color: C.textDim, letterSpacing: 1.5,
        marginTop: 4, fontWeight: '600',
    },
});