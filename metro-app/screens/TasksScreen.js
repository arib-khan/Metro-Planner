// screens/TasksScreen.js
// Ground staff can see their assigned tasks and update status.
//
// Add to AppStack.js:
//   import TasksScreen from '../screens/TasksScreen';
//   <Stack.Screen name="Tasks" component={TasksScreen} options={{ title: 'My Tasks' }} />
//
// Or add a Tasks button anywhere in your HomeScreen:
//   <TouchableOpacity onPress={() => navigation.navigate('Tasks')}>
//     <Text>My Tasks</Text>
//   </TouchableOpacity>

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
    StyleSheet,
    StatusBar,
    Animated,
    Platform,
} from 'react-native';
import { Text } from 'react-native-paper';
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    doc,
    updateDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../utils/authHelpers';

// ─── Colours ──────────────────────────────────────────────────────────────────

const PRIORITY_STYLE = {
    low: { bg: '#052e16', border: '#16a34a', text: '#4ade80', label: 'LOW' },
    medium: { bg: '#451a03', border: '#d97706', text: '#fbbf24', label: 'MED' },
    high: { bg: '#450a0a', border: '#dc2626', text: '#f87171', label: 'HIGH' },
};

const STATUS_STYLE = {
    pending: { bg: '#0f172a', border: '#334155', text: '#94a3b8', label: 'PENDING' },
    in_progress: { bg: '#0c1a3a', border: '#1d4ed8', text: '#60a5fa', label: 'IN PROGRESS' },
    completed: { bg: '#052e16', border: '#16a34a', text: '#4ade80', label: 'DONE' },
};

const NEXT_STATUS = {
    pending: 'in_progress',
    in_progress: 'completed',
    completed: null,
};

const ACTION_LABEL = {
    pending: 'Start Task',
    in_progress: 'Mark as Complete',
};

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onStatusUpdate }) {
    const [updating, setUpdating] = useState(false);
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(12)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
    }, []);

    const priority = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.medium;
    const status = STATUS_STYLE[task.status] || STATUS_STYLE.pending;
    const next = NEXT_STATUS[task.status];
    const action = ACTION_LABEL[task.status];

    const handleAdvance = async () => {
        if (!next || updating) return;
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'tasks', task.id), { status: next });
            onStatusUpdate(task.id, next);
        } catch (e) {
            console.error('Status update failed:', e);
        } finally {
            setUpdating(false);
        }
    };

    const dateStr = task.createdAt?.toDate
        ? task.createdAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Recently';

    return (
        <Animated.View
            style={[
                styles.card,
                { borderColor: status.border, opacity, transform: [{ translateY }] },
            ]}
        >
            {/* Title + badges */}
            <View style={styles.cardTitleRow}>
                <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
                <View style={styles.badgeGroup}>
                    <View style={[styles.badge, { backgroundColor: priority.bg, borderColor: priority.border }]}>
                        <Text style={[styles.badgeText, { color: priority.text }]}>{priority.label}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: status.bg, borderColor: status.border }]}>
                        <Text style={[styles.badgeText, { color: status.text }]}>{status.label}</Text>
                    </View>
                </View>
            </View>

            {/* Description */}
            {!!task.description && (
                <Text style={styles.taskDesc} numberOfLines={3}>{task.description}</Text>
            )}

            {/* Meta */}
            <View style={styles.metaRow}>
                <Text style={styles.metaText}>📅 Assigned: {dateStr}</Text>
                {!!task.dueDate && (
                    <Text style={[styles.metaText, { color: '#f87171' }]}>⏰ Due: {task.dueDate}</Text>
                )}
            </View>

            {/* Action button */}
            {action && (
                <TouchableOpacity
                    onPress={handleAdvance}
                    disabled={updating}
                    activeOpacity={0.8}
                    style={[
                        styles.actionBtn,
                        task.status === 'in_progress'
                            ? { backgroundColor: '#16a34a18', borderColor: '#16a34a' }
                            : { backgroundColor: '#1d4ed818', borderColor: '#1d4ed8' },
                        updating && { opacity: 0.5 },
                    ]}
                >
                    <Text style={[
                        styles.actionBtnText,
                        { color: task.status === 'in_progress' ? '#4ade80' : '#60a5fa' },
                    ]}>
                        {updating ? 'Updating…' : action}
                    </Text>
                </TouchableOpacity>
            )}

            {/* Completed state */}
            {task.status === 'completed' && (
                <View style={styles.completedRow}>
                    <Text style={styles.completedText}>✓  Task Completed</Text>
                </View>
            )}
        </Animated.View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TasksScreen() {
    const { user } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState('all');

    const loadTasks = useCallback(async () => {
        if (!user) return;
        try {
            const q = query(
                collection(db, 'tasks'),
                where('assignedTo', '==', user.uid)
            );

            const snap = await getDocs(q);
            setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('Error loading tasks:', e);
        }
    }, [user]);

    useEffect(() => {
        loadTasks().finally(() => setLoading(false));
    }, [loadTasks]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadTasks();
        setRefreshing(false);
    };

    const handleStatusUpdate = (taskId, newStatus) => {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    };

    const counts = {
        all: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
    };

    const FILTERS = [
        { key: 'all', label: 'All' },
        { key: 'pending', label: 'Pending' },
        { key: 'in_progress', label: 'In Progress' },
        { key: 'completed', label: 'Done' },
    ];

    const visible = activeFilter === 'all'
        ? tasks
        : tasks.filter(t => t.status === activeFilter);

    if (loading) {
        return (
            <View style={styles.centered}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1e" />
                <Text style={styles.loadingText}>Loading your tasks…</Text>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1e" />

            {/* Filter tabs */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabBar}
                contentContainerStyle={styles.tabBarContent}
            >
                {FILTERS.map(f => {
                    const active = activeFilter === f.key;
                    return (
                        <TouchableOpacity
                            key={f.key}
                            onPress={() => setActiveFilter(f.key)}
                            style={[styles.tab, active && styles.tabActive]}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{f.label}</Text>
                            <View style={[styles.tabCount, active && styles.tabCountActive]}>
                                <Text style={[styles.tabCountText, active && { color: '#fff' }]}>
                                    {counts[f.key]}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Task list */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#3b82f6"
                        colors={['#3b82f6']}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {visible.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>
                            {activeFilter === 'completed' ? '🎉' : '📋'}
                        </Text>
                        <Text style={styles.emptyTitle}>
                            {activeFilter === 'all' ? 'No Tasks Yet' : `No ${activeFilter.replace('_', ' ')} tasks`}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                            {activeFilter === 'all'
                                ? 'Your supervisor will assign tasks here'
                                : 'Pull down to refresh'}
                        </Text>
                    </View>
                ) : (
                    visible.map(task => (
                        <TaskCard key={task.id} task={task} onStatusUpdate={handleStatusUpdate} />
                    ))
                )}
            </ScrollView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#0a0f1e' },
    centered: { flex: 1, backgroundColor: '#0a0f1e', alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: '#6b7fa3', fontSize: 14 },

    tabBar: { flexGrow: 0, backgroundColor: '#0f1623', borderBottomWidth: 1, borderBottomColor: '#1e2d45' },
    tabBarContent: { flexDirection: 'row', padding: 10, gap: 8 },
    tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#1e2d45', backgroundColor: '#0d1424' },
    tabActive: { borderColor: '#3b82f6', backgroundColor: '#1e3a5f' },
    tabLabel: { fontSize: 13, color: '#6b7fa3', fontWeight: '500' },
    tabLabelActive: { color: '#93c5fd', fontWeight: '700' },
    tabCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#1e2d45', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    tabCountActive: { backgroundColor: '#3b82f6' },
    tabCountText: { fontSize: 10, fontWeight: '800', color: '#6b7fa3' },

    listContent: { padding: 16, paddingBottom: 48 },

    card: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 12 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
    taskTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#f0f4ff', lineHeight: 22 },
    taskDesc: { fontSize: 13, color: '#6b7fa3', lineHeight: 19, marginBottom: 10 },
    badgeGroup: { flexDirection: 'row', gap: 5, flexShrink: 0 },
    badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
    badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    metaText: { fontSize: 11, color: '#3d506b' },
    actionBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
    actionBtnText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
    completedRow: { alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#16a34a30', marginTop: 4 },
    completedText: { fontSize: 13, color: '#4ade80', fontWeight: '600' },

    emptyState: { alignItems: 'center', paddingTop: 80, paddingBottom: 40 },
    emptyIcon: { fontSize: 52, marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f0f4ff', marginBottom: 8 },
    emptySubtitle: { fontSize: 13, color: '#3d506b', textAlign: 'center', paddingHorizontal: 40 },
});