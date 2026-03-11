// screens/HistoryScreen.js
// History & Analysis
// Collections used:
//   trainInduction — induction submission records
//   tasks          — tasks assigned to the current user (assignedTo == uid)
//
// AppStack.js setup:
//   import HistoryScreen from '../screens/HistoryScreen';
//   <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'History & Analysis' }} />

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, ScrollView, RefreshControl, TouchableOpacity,
    StyleSheet, StatusBar, Animated, Dimensions,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { collection, query, where, getDocs, getFirestore } from 'firebase/firestore';
import { useAuth } from '../utils/authHelpers';

const db = getFirestore();
const { width: W } = Dimensions.get('window');

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
    bg: '#0a0f1e', surface: '#111827', surface2: '#0d1424', border: '#1e2d45',
    text: '#f0f4ff', textMuted: '#6b7fa3', textDim: '#3d506b', accent: '#3b82f6',
    green: '#4ade80', amber: '#fbbf24', red: '#f87171', purple: '#a78bfa',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(ts) {
    if (!ts) return '—';
    try {
        const d = ts?.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '—'; }
}

function fmtDateTime(ts) {
    if (!ts) return '—';
    try {
        const d = ts?.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
}

// Safely render any Firestore value — never produces [object Object]
function renderValue(val) {
    if (val === null || val === undefined || val === '') return '—';
    if (val?.toDate) return fmtDateTime(val);
    if (Array.isArray(val)) {
        return val.length
            ? val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ')
            : '—';
    }
    if (typeof val === 'object') {
        const parts = Object.entries(val)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => {
                const lbl = k.replace(/_/g, ' ');
                const display = v?.toDate ? fmtDate(v) : typeof v === 'object' ? JSON.stringify(v) : String(v);
                return `${lbl}: ${display}`;
            });
        return parts.length ? parts.join('  ·  ') : '—';
    }
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
}

function niceLabel(key) {
    return key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
}

function countBy(arr, fn) {
    return arr.reduce((acc, x) => {
        const k = fn(x) || 'Unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});
}

function last7Labels() {
    return Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    });
}

function perDay(items) {
    const labels = last7Labels();
    const counts = Object.fromEntries(labels.map(l => [l, 0]));
    items.forEach(x => {
        try {
            const raw = x.createdAt || x.timestamp;
            const d = raw?.toDate ? raw.toDate() : new Date(raw || 0);
            const lbl = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            if (counts[lbl] !== undefined) counts[lbl]++;
        } catch { }
    });
    return labels.map(l => ({ label: l, value: counts[l] }));
}

// ─── Shared UI components ─────────────────────────────────────────────────────
function BarChart({ data, color = C.accent, height = 90 }) {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
        <View style={{ paddingTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: height + 32, gap: 4 }}>
                {data.map((d, i) => {
                    const barH = Math.max(3, (d.value / max) * height);
                    const isToday = i === data.length - 1;
                    return (
                        <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                            {d.value > 0 && <Text style={{ fontSize: 9, color: C.textMuted, marginBottom: 2 }}>{d.value}</Text>}
                            <View style={{ width: '80%', height: barH, backgroundColor: isToday ? color : color + '88', borderRadius: 4 }} />
                            <Text style={{ fontSize: 8, color: isToday ? C.textMuted : C.textDim, marginTop: 5, textAlign: 'center' }}>
                                {d.label.split(' ')[0]}
                            </Text>
                        </View>
                    );
                })}
            </View>
            <Text style={{ fontSize: 10, color: C.textDim, textAlign: 'right', marginTop: 4 }}>Last 7 days</Text>
        </View>
    );
}

function ProgressRow({ label, value, total, color }) {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
        <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text style={{ color: C.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
                <Text style={{ color: C.textMuted, fontSize: 12 }}>
                    {value}<Text style={{ color: C.textDim }}>/{total}</Text>
                </Text>
            </View>
            <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
            </View>
        </View>
    );
}

function StatCard({ iconName, label, value, color, sub }) {
    return (
        <View style={[styles.statCard, { borderColor: color + '55' }]}>
            <View style={[styles.statIconBox, { backgroundColor: color + '18' }]}>
                <IconButton icon={iconName} size={22} iconColor={color} style={{ margin: 0 }} />
            </View>
            <Text style={[styles.statVal, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
            {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
        </View>
    );
}

function Empty({ iconName, title, sub }) {
    return (
        <View style={styles.emptyState}>
            <IconButton icon={iconName} size={52} iconColor={C.textDim} style={{ margin: 0, marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>{title}</Text>
            <Text style={styles.emptySub}>{sub || 'Pull down to refresh'}</Text>
        </View>
    );
}

// ─── Induction Card ───────────────────────────────────────────────────────────
function InductionCard({ item, index }) {
    const [expanded, setExpanded] = useState(false);
    const fa = useRef(new Animated.Value(0)).current;
    const sa = useRef(new Animated.Value(10)).current;
    useEffect(() => {
        setTimeout(() => {
            Animated.parallel([
                Animated.timing(fa, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(sa, { toValue: 0, duration: 280, useNativeDriver: true }),
            ]).start();
        }, Math.min(index * 40, 300));
    }, []);

    // Resolve train ID from every possible field name
    const trainId = item.train_id || item.trainId || item.trainNumber
        || item.train_number || item.trainNo || item.train
        || item.parsedData?.train_id || item.parsedData?.trainNumber
        || item.id;

    const submittedBy = item.userName || item.userEmail
        || item.submittedByName || item.inspectorName || '';

    const status = item.status || item.syncStatus || 'submitted';
    const sc = status === 'approved' ? C.green : status === 'rejected' ? C.red : C.accent;
    const dateTs = item.createdAt || item.timestamp || item.approvedAt;

    // Everything not shown in the header
    const SKIP = new Set([
        'id', 'train_id', 'trainId', 'trainNumber', 'train_number', 'trainNo', 'train',
        'userName', 'userEmail', 'submittedByName', 'inspectorName', 'createdByName',
        'status', 'syncStatus', 'createdAt', 'timestamp', 'uid', 'userId', 'source', 'createdBy',
    ]);
    const detailEntries = Object.entries(item).filter(([k]) => !SKIP.has(k));

    return (
        <Animated.View style={[styles.row, { opacity: fa, transform: [{ translateY: sa }] }]}>
            <View style={[styles.rowBar, { backgroundColor: C.accent }]} />
            <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                    <IconButton icon="train" size={16} iconColor={C.accent} style={styles.inlineIcon} />
                    <Text style={[styles.rowTitle, { flex: 1 }]}>{trainId}</Text>
                    <View style={[styles.pill, { backgroundColor: sc + '18', borderColor: sc }]}>
                        <Text style={[styles.pillTxt, { color: sc }]}>{status.toUpperCase()}</Text>
                    </View>
                </View>

                {!!submittedBy && (
                    <View style={styles.metaRow}>
                        <IconButton icon="account-outline" size={13} iconColor={C.textMuted} style={styles.inlineIcon} />
                        <Text style={styles.rowMeta}>{submittedBy}</Text>
                    </View>
                )}
                {item.date && (
                    <View style={styles.metaRow}>
                        <IconButton icon="calendar-outline" size={13} iconColor={C.textMuted} style={styles.inlineIcon} />
                        <Text style={styles.rowMeta}>{item.date}</Text>
                    </View>
                )}
                <View style={styles.metaRow}>
                    <IconButton icon="clock-outline" size={13} iconColor={C.textDim} style={styles.inlineIcon} />
                    <Text style={styles.rowTime}>{fmtDateTime(dateTs)}</Text>
                </View>

                {detailEntries.length > 0 && (
                    <TouchableOpacity onPress={() => setExpanded(e => !e)} style={styles.expandBtn} activeOpacity={0.7}>
                        <IconButton icon={expanded ? 'chevron-up' : 'chevron-down'} size={14} iconColor={C.accent} style={styles.inlineIcon} />
                        <Text style={styles.expandBtnTxt}>
                            {expanded ? 'Hide details' : `Show details (${detailEntries.length} fields)`}
                        </Text>
                    </TouchableOpacity>
                )}

                {expanded && (
                    <View style={styles.detailBlock}>
                        {detailEntries.map(([k, v]) => {
                            const rendered = renderValue(v);
                            if (rendered === '—') return null;
                            return (
                                <View key={k} style={styles.detailRow}>
                                    <Text style={styles.detailKey}>{niceLabel(k)}</Text>
                                    <Text style={styles.detailVal}>{rendered}</Text>
                                </View>
                            );
                        })}
                    </View>
                )}
            </View>
        </Animated.View>
    );
}

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskRow({ item, index }) {
    const fa = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        setTimeout(() => {
            Animated.timing(fa, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        }, Math.min(index * 40, 300));
    }, []);

    const pc = item.priority === 'high' ? C.red : item.priority === 'low' ? C.green : C.amber;
    const sc = item.status === 'completed' ? C.green : item.status === 'in_progress' ? '#60a5fa' : '#94a3b8';
    const sl = item.status === 'in_progress' ? 'IN PROGRESS' : (item.status || 'PENDING').toUpperCase();

    return (
        <Animated.View style={[styles.row, { opacity: fa }]}>
            <View style={[styles.rowBar, { backgroundColor: pc }]} />
            <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                    <View style={styles.pillGroup}>
                        <View style={[styles.pillSm, { backgroundColor: pc + '18', borderColor: pc }]}>
                            <Text style={[styles.pillTxt, { color: pc }]}>{(item.priority || 'MED').toUpperCase()}</Text>
                        </View>
                        <View style={[styles.pillSm, { backgroundColor: sc + '18', borderColor: sc }]}>
                            <Text style={[styles.pillTxt, { color: sc }]}>{sl}</Text>
                        </View>
                    </View>
                </View>
                {!!item.description && (
                    <Text style={[styles.rowMeta, { marginBottom: 4 }]} numberOfLines={2}>{item.description}</Text>
                )}
                <View style={styles.metaRow}>
                    <IconButton icon="calendar-check-outline" size={13} iconColor={C.textDim} style={styles.inlineIcon} />
                    <Text style={styles.rowTime}>Assigned {fmtDate(item.createdAt)}</Text>
                </View>
                {item.dueDate && (
                    <View style={styles.metaRow}>
                        <IconButton icon="alarm" size={13} iconColor={C.red} style={styles.inlineIcon} />
                        <Text style={[styles.rowTime, { color: C.red }]}>Due: {item.dueDate}</Text>
                    </View>
                )}
            </View>
        </Animated.View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HistoryScreen() {
    const { user } = useAuth();

    const [inductions, setInductions] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [taskFilter, setTaskFilter] = useState('all');
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const loadAll = useCallback(async () => {
        if (!user) return;
        try {

            // trainInduction — no orderBy to avoid index requirement
            const iSnap = await getDocs(collection(db, 'trainInduction'));
            setInductions(
                iSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => {
                        const aT = a.createdAt?.toDate?.() || a.timestamp?.toDate?.() || new Date(0);
                        const bT = b.createdAt?.toDate?.() || b.timestamp?.toDate?.() || new Date(0);
                        return bT - aT;
                    })
            );

            // tasks assigned to this user only
            const tSnap = await getDocs(
                query(collection(db, 'tasks'), where('assignedTo', '==', user.uid))
            );
            setTasks(
                tSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0))
            );
        } catch (e) {
            console.error('HistoryScreen load error:', e);
        }
    }, [user]);

    useEffect(() => {
        loadAll().finally(() => {
            setLoading(false);
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        });
    }, [loadAll]);

    const onRefresh = async () => { setRefreshing(true); await loadAll(); setRefreshing(false); };

    // ── Derived stats ──────────────────────────────────────────────────────────
    const done = tasks.filter(t => t.status === 'completed');
    const inProg = tasks.filter(t => t.status === 'in_progress');
    const pending = tasks.filter(t => t.status === 'pending');
    const rate = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;
    const prioMap = countBy(tasks, t => t.priority);
    const thisMonth = inductions.filter(i => {
        try {
            const raw = i.createdAt || i.timestamp;
            const d = raw?.toDate ? raw.toDate() : new Date(raw || 0);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        } catch { return false; }
    });

    const filteredTasks = taskFilter === 'all' ? tasks : tasks.filter(t => t.status === taskFilter);

    const TASK_FILTERS = [
        { key: 'all', label: 'All', count: tasks.length },
        { key: 'pending', label: 'Pending', count: pending.length },
        { key: 'in_progress', label: 'In Progress', count: inProg.length },
        { key: 'completed', label: 'Done', count: done.length },
    ];

    const TABS = [
        { key: 'overview', label: 'Overview', iconName: 'chart-bar' },
        { key: 'inductions', label: 'Inductions', iconName: 'clipboard-list-outline', count: inductions.length },
        { key: 'tasks', label: 'My Tasks', iconName: 'checkbox-marked-outline', count: tasks.length },
    ];

    if (loading) return (
        <View style={styles.centered}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            <Text style={{ color: C.textMuted, fontSize: 14 }}>Loading history…</Text>
        </View>
    );

    const OverviewTab = () => (
        <>
            <View style={styles.statsGrid}>
                <StatCard iconName="clipboard-list-outline" label="Inductions" value={inductions.length} color={C.accent} sub={`${thisMonth.length} this month`} />
                <StatCard iconName="check-circle-outline" label="Tasks Done" value={done.length} color={C.green} sub={`${rate}% completion`} />
                <StatCard iconName="progress-clock" label="In Progress" value={inProg.length} color={C.amber} sub={`${pending.length} pending`} />
                <StatCard iconName="clipboard-text-outline" label="All Tasks" value={tasks.length} color={C.purple} sub="assigned to you" />
            </View>

            <Text style={styles.sectionLabel}>TASK STATUS BREAKDOWN</Text>
            <View style={styles.card}>
                {tasks.length === 0
                    ? <Text style={styles.emptyNote}>No tasks assigned yet</Text>
                    : <>
                        <ProgressRow label="Completed" value={done.length} total={tasks.length} color={C.green} />
                        <ProgressRow label="In Progress" value={inProg.length} total={tasks.length} color="#60a5fa" />
                        <ProgressRow label="Pending" value={pending.length} total={tasks.length} color="#94a3b8" />
                    </>
                }
            </View>

            {tasks.length > 0 && (
                <>
                    <Text style={styles.sectionLabel}>PRIORITY BREAKDOWN</Text>
                    <View style={styles.card}>
                        {[['high', C.red, 'High'], ['medium', C.amber, 'Medium'], ['low', C.green, 'Low']]
                            .filter(([k]) => (prioMap[k] || 0) > 0)
                            .map(([k, c, l]) => <ProgressRow key={k} label={l} value={prioMap[k]} total={tasks.length} color={c} />)
                        }
                    </View>
                </>
            )}

            <Text style={styles.sectionLabel}>INDUCTIONS — LAST 7 DAYS</Text>
            <View style={styles.card}>
                {inductions.length === 0
                    ? <Text style={styles.emptyNote}>No induction records found</Text>
                    : <BarChart data={perDay(inductions)} color={C.accent} />
                }
            </View>

            {done.length > 0 && (
                <>
                    <Text style={styles.sectionLabel}>COMPLETED TASKS — LAST 7 DAYS</Text>
                    <View style={styles.card}><BarChart data={perDay(done)} color={C.green} /></View>
                </>
            )}
        </>
    );

    return (
        <Animated.View style={[{ flex: 1, backgroundColor: C.bg }, { opacity: fadeAnim }]}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />

            {/* Tab bar */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
                {TABS.map(t => {
                    const active = activeTab === t.key;
                    return (
                        <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)}
                            style={[styles.tab, active && styles.tabActive]} activeOpacity={0.7}>
                            <IconButton icon={t.iconName} size={14} iconColor={active ? '#93c5fd' : C.textMuted} style={styles.inlineIcon} />
                            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
                            {t.count !== undefined && (
                                <View style={[styles.tabCount, active && styles.tabCountActive]}>
                                    <Text style={[styles.tabCountTxt, active && { color: '#fff' }]}>{t.count}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Content */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
                showsVerticalScrollIndicator={false}>

                {activeTab === 'overview' && <OverviewTab />}

                {activeTab === 'inductions' && (
                    inductions.length === 0
                        ? <Empty iconName="clipboard-list-outline" title="No Induction Records" sub="Submitted induction forms will appear here" />
                        : inductions.map((x, i) => <InductionCard key={x.id} item={x} index={i} />)
                )}

                {activeTab === 'tasks' && (
                    <>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                            {TASK_FILTERS.map(f => {
                                const active = taskFilter === f.key;
                                return (
                                    <TouchableOpacity key={f.key} onPress={() => setTaskFilter(f.key)}
                                        style={[styles.chip, active && styles.chipActive]} activeOpacity={0.7}>
                                        <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                                            {f.label}{f.count > 0 ? ` (${f.count})` : ''}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                        {filteredTasks.length === 0
                            ? <Empty iconName="checkbox-marked-outline" title="No tasks here" />
                            : filteredTasks.map((x, i) => <TaskRow key={x.id} item={x} index={i} />)
                        }
                    </>
                )}

                <View style={{ height: 48 }} />
            </ScrollView>
        </Animated.View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    centered: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },

    tabBar: { flexGrow: 0, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
    tabBarContent: { flexDirection: 'row', padding: 10, gap: 8 },
    tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
    tabActive: { borderColor: C.accent, backgroundColor: '#1e3a5f' },
    tabLabel: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
    tabLabelActive: { color: '#93c5fd', fontWeight: '700' },
    tabCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    tabCountActive: { backgroundColor: C.accent },
    tabCountTxt: { fontSize: 10, fontWeight: '800', color: C.textMuted },

    listContent: { padding: 16 },
    sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: C.textMuted, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
    card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 12 },

    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    statCard: { width: (W - 52) / 2, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1.5, padding: 14, alignItems: 'center' },
    statIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    statVal: { fontSize: 24, fontWeight: '800' },
    statLabel: { fontSize: 11, color: C.textMuted, marginTop: 2, fontWeight: '600', textAlign: 'center' },
    statSub: { fontSize: 10, color: C.textDim, marginTop: 2, textAlign: 'center' },

    progressBg: { height: 7, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: 7, borderRadius: 4 },

    row: { flexDirection: 'row', gap: 12, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8, overflow: 'hidden' },
    rowBar: { width: 3, borderRadius: 2, alignSelf: 'stretch' },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, gap: 8 },
    rowTitle: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
    rowMeta: { fontSize: 12, color: C.textMuted, marginBottom: 2 },
    rowTime: { fontSize: 11, color: C.textDim, marginTop: 2 },

    pill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
    pillSm: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    pillTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
    pillGroup: { flexDirection: 'row', gap: 4, flexShrink: 0 },

    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 3 },
    inlineIcon: { margin: 0, padding: 0, width: 20, height: 20 },

    expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingVertical: 4 },
    expandBtnTxt: { fontSize: 11, color: C.accent, fontWeight: '600' },
    detailBlock: { marginTop: 10, borderRadius: 10, backgroundColor: '#070d1a', padding: 12, gap: 10, borderWidth: 1, borderColor: '#1e3a5f' },
    detailRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    detailKey: { fontSize: 11, color: '#7dd3fc', fontWeight: '700', width: 130, flexShrink: 0 },
    detailVal: { fontSize: 12, color: '#e2e8f0', flex: 1, lineHeight: 18 },

    chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
    chipActive: { borderColor: C.accent, backgroundColor: '#1e3a5f' },
    chipTxt: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
    chipTxtActive: { color: '#93c5fd', fontWeight: '700' },

    emptyState: { alignItems: 'center', paddingTop: 70, paddingBottom: 40 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
    emptySub: { fontSize: 12, color: C.textDim, textAlign: 'center', paddingHorizontal: 40 },
    emptyNote: { color: C.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
});