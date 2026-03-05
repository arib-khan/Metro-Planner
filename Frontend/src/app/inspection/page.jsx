"use client";
import React, { useState, useEffect } from 'react';
import {
  Camera, AlertTriangle, CheckCircle, Clock, TrendingUp,
  Wrench, Image as ImageIcon, X, Loader2, UserCheck,
  CircleDot, CircleCheck, Circle
} from 'lucide-react';
import {
  collection, query, orderBy, onSnapshot,
  getDocs, addDoc, serverTimestamp, where
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

// ─── Task Status Badge ────────────────────────────────────────────────────────
function TaskStatusBadge({ taskInfo }) {
  if (!taskInfo) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 border border-gray-200 px-2 py-1 rounded-full">
        <Circle className="h-3 w-3" />
        Not assigned
      </span>
    );
  }
  if (taskInfo.status === 'completed') {
    return (
      <div className="space-y-0.5">
        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 border border-green-200 px-2 py-1 rounded-full font-medium">
          <CircleCheck className="h-3 w-3" />
          Done
        </span>
        <p className="text-xs text-gray-400 pl-1">{taskInfo.assignedToName}</p>
      </div>
    );
  }
  if (taskInfo.status === 'in_progress') {
    return (
      <div className="space-y-0.5">
        <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-100 border border-blue-200 px-2 py-1 rounded-full font-medium">
          <CircleDot className="h-3 w-3" />
          In progress
        </span>
        <p className="text-xs text-gray-400 pl-1">{taskInfo.assignedToName}</p>
      </div>
    );
  }
  // pending
  return (
    <div className="space-y-0.5">
      <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-100 border border-orange-200 px-2 py-1 rounded-full font-medium">
        <Clock className="h-3 w-3" />
        Pending
      </span>
      <p className="text-xs text-gray-400 pl-1">{taskInfo.assignedToName}</p>
    </div>
  );
}

// ─── Assign Fix Modal ─────────────────────────────────────────────────────────
function AssignFixModal({ inspection, onClose, currentUser }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUser, setSelectedUser] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState('high');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setUsers(all.filter(u => u.appType !== 'web' && !u.isBlocked));
      } catch (e) {
        console.error('Failed to load users:', e);
        setError('Could not load users. Check Firestore rules.');
      } finally {
        setLoadingUsers(false);
      }
    };
    load();
  }, []);

  const partName = inspection.inspectionData?.part_name || 'Unknown Part';
  const trainId = inspection.trainId || 'Unknown Train';
  const issueDesc = inspection.inspectionData?.description_of_issue || '';
  const status = inspection.inspectionData?.damage_status || '';
  const shouldRepl = inspection.inspectionData?.should_replace || '';
  const taskTitle = `Fix ${partName} on ${trainId}`;
  const taskDesc = [
    issueDesc,
    shouldRepl === 'yes' ? '⚠️ Replacement required.' : '',
    note ? `Note: ${note}` : ''
  ].filter(Boolean).join('\n');

  const handleAssign = async () => {
    if (!selectedUser) { setError('Please select a staff member'); return; }
    setSaving(true);
    setError('');
    try {
      const target = users.find(u => u.uid === selectedUser);
      await addDoc(collection(db, 'tasks'), {
        title: taskTitle,
        description: taskDesc,
        priority,
        dueDate: dueDate || null,
        assignedTo: target.uid,
        assignedToEmail: target.email,
        assignedToName: target.displayName || target.email,
        status: 'pending',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        sourceInspectionId: inspection.id,
        sourceTrainId: trainId,
        sourcePartName: partName,
      });
      setSaved(true);
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      console.error('Assign fix error:', e);
      setError('Failed to assign task. Try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <Wrench className="h-5 w-5 text-orange-500" />
              Assign Fix
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{partName} · {trainId}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {saved ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <p className="font-semibold text-gray-900">Fix Assigned!</p>
            <p className="text-sm text-gray-500 mt-1">The staff member will see it on their app.</p>
          </div>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm">
                <p className="font-semibold text-gray-900 mb-1">{taskTitle}</p>
                {issueDesc && <p className="text-gray-600 text-xs line-clamp-2">{issueDesc}</p>}
                <div className="flex gap-2 mt-2">
                  {status && (
                    <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">{status}</span>
                  )}
                  {shouldRepl === 'yes' && (
                    <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">Replacement needed</span>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Assign To *</label>
                {loadingUsers ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading staff…
                  </div>
                ) : users.length === 0 ? (
                  <p className="text-sm text-gray-400">No mobile users found.</p>
                ) : (
                  <select
                    value={selectedUser}
                    onChange={e => setSelectedUser(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="">— Select staff member —</option>
                    {users.map(u => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName ? `${u.displayName} (${u.email})` : u.email}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Priority</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Additional Note</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Any extra instructions for the staff member…"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={saving || loadingUsers}
                className="flex-1 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning…</>
                  : <><UserCheck className="h-4 w-4" /> Assign Fix</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const PhotoInspections = () => {
  const { user: currentUser } = useAuth();
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignTarget, setAssignTarget] = useState(null);
  // map: inspectionId -> { status, assignedToName }
  const [inspectionTasks, setInspectionTasks] = useState({});
  const [stats, setStats] = useState({
    total: 0, damaged: 0, healthy: 0, replacementNeeded: 0, avgConfidence: 0
  });

  // Real-time inspections
  useEffect(() => {
    const q = query(collection(db, 'photoReports'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInspections(data);
      calculateStats(data);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching inspections:', err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time task statuses — updates instantly when mobile staff mark tasks done
  useEffect(() => {
    const q = query(collection(db, 'tasks'), where('sourceInspectionId', '!=', null));
    const unsubscribe = onSnapshot(q, (snap) => {
      const map = {};
      const rank = { completed: 3, in_progress: 2, pending: 1 };
      snap.forEach(doc => {
        const t = doc.data();
        if (!t.sourceInspectionId) return;
        const existing = map[t.sourceInspectionId];
        if (!existing || (rank[t.status] || 0) > (rank[existing.status] || 0)) {
          map[t.sourceInspectionId] = {
            status: t.status,
            assignedToName: t.assignedToName || t.assignedToEmail || 'Unknown',
          };
        }
      });
      setInspectionTasks(map);
    }, (err) => {
      // Silently ignore — index may not exist yet, non-critical
      console.warn('Task status listener:', err.message);
    });
    return () => unsubscribe();
  }, []);

  const calculateStats = (data) => {
    const damaged = data.filter(i =>
      i.inspectionData?.damage_status === 'damaged' || i.inspectionData?.damage_status === 'severe'
    ).length;
    const healthy = data.filter(i =>
      i.inspectionData?.damage_status === 'not_damaged' || i.inspectionData?.damage_status === 'good'
    ).length;
    const replacementNeeded = data.filter(i => i.inspectionData?.should_replace === 'yes').length;
    const avgConf = data.length > 0
      ? data.reduce((acc, i) => acc + (i.inspectionData?.confidence || 0), 0) / data.length : 0;
    setStats({ total: data.length, damaged, healthy, replacementNeeded, avgConfidence: avgConf.toFixed(1) });
  };

  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'damaged': case 'severe': return 'bg-red-100 text-red-800 border border-red-200';
      case 'moderate': return 'bg-orange-100 text-orange-800 border border-orange-200';
      case 'minor': case 'slight': return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'not_damaged': case 'good': return 'bg-green-100 text-green-800 border border-green-200';
      default: return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const getReplacementBadge = (r) => {
    switch (r?.toLowerCase()) {
      case 'yes': return 'bg-red-500 text-white';
      case 'no': return 'bg-green-500 text-white';
      case 'monitor': return 'bg-orange-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getConfidenceColor = (c) => {
    if (c >= 90) return 'text-green-600';
    if (c >= 70) return 'text-orange-600';
    return 'text-red-600';
  };

  const formatTimestamp = (ts) => {
    if (!ts) return 'N/A';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(d);
    } catch { return 'N/A'; }
  };

  const recentInspections = inspections.slice(0, 5);
  const criticalInspections = inspections.filter(i =>
    i.inspectionData?.damage_status === 'damaged' || i.inspectionData?.should_replace === 'yes'
  ).slice(0, 5);

  const AssignBtn = ({ inspection }) => (
    <button
      onClick={() => setAssignTarget(inspection)}
      className="inline-flex items-center gap-1.5 font-medium rounded-lg transition-colors bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 px-2.5 py-1 text-xs whitespace-nowrap"
    >
      <Wrench className="h-3.5 w-3.5" />
      Assign Fix
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {assignTarget && currentUser && (
        <AssignFixModal
          inspection={assignTarget}
          currentUser={currentUser}
          onClose={() => setAssignTarget(null)}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Title */}
        <div className="mb-6">
          <div className="flex items-center mb-2">
            <Camera className="h-8 w-8 mr-3 text-gray-900" />
            <h2 className="text-3xl font-bold text-gray-900">Photo Inspections</h2>
          </div>
          <p className="text-sm text-gray-600 max-w-4xl">
            AI-powered visual inspection system for train parts. Upload photos via the mobile app to automatically detect defects,
            identify parts, assess damage severity, and receive replacement recommendations with confidence scores.
          </p>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total Inspections', value: stats.total, sub: 'All time', icon: <ImageIcon className="h-5 w-5 text-gray-400" />, cls: 'text-gray-900' },
            { label: 'Damaged Parts', value: stats.damaged, sub: 'Require attention', icon: <AlertTriangle className="h-5 w-5 text-red-400" />, cls: 'text-red-600', subcls: 'text-red-600' },
            { label: 'Healthy Parts', value: stats.healthy, sub: 'No issues found', icon: <CheckCircle className="h-5 w-5 text-green-400" />, cls: 'text-green-600', subcls: 'text-green-600' },
            { label: 'Replacements', value: stats.replacementNeeded, sub: 'Need replacement', icon: <Wrench className="h-5 w-5 text-orange-400" />, cls: 'text-orange-600', subcls: 'text-orange-600' },
            { label: 'Avg Confidence', value: `${stats.avgConfidence}%`, sub: 'AI accuracy', icon: <TrendingUp className="h-5 w-5 text-gray-400" />, cls: 'text-gray-900' },
          ].map(({ label, value, sub, icon, cls, subcls }) => (
            <div key={label} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">{label}</span>
                {icon}
              </div>
              <div className={`text-3xl font-bold ${cls}`}>{value}</div>
              <div className={`text-xs mt-1 ${subcls || 'text-gray-600'}`}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Recent + Critical */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          {/* Recent Inspections */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900">Recent Inspections</h3>
              </div>
              <span className="text-sm text-gray-500">{inspections.length} total</span>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading inspections...</div>
            ) : inspections.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Camera className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No inspections yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Train ID</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Part</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Status</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Replace</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Confidence</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Time</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Fix Status</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInspections.map((ins) => (
                      <tr key={ins.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-4 text-sm font-medium text-gray-900">{ins.trainId || 'N/A'}</td>
                        <td className="py-4 px-4 text-sm text-gray-700">{ins.inspectionData?.part_name || 'Unknown'}</td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(ins.inspectionData?.damage_status)}`}>
                            {ins.inspectionData?.damage_status || 'N/A'}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getReplacementBadge(ins.inspectionData?.should_replace)}`}>
                            {ins.inspectionData?.should_replace || 'N/A'}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`text-sm font-semibold ${getConfidenceColor(ins.inspectionData?.confidence)}`}>
                            {ins.inspectionData?.confidence || 0}%
                          </span>
                        </td>
                        <td className="py-4 px-4 text-sm text-gray-500">{formatTimestamp(ins.timestamp)}</td>
                        <td className="py-4 px-4">
                          <TaskStatusBadge taskInfo={inspectionTasks[ins.id]} />
                        </td>
                        <td className="py-4 px-4">
                          <AssignBtn inspection={ins} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Critical Alerts */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900">Critical Alerts</h3>
            </div>
            <div className="text-xs text-gray-500 mb-4">Parts requiring immediate attention</div>

            {criticalInspections.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-300" />
                <p className="text-sm">No critical issues</p>
              </div>
            ) : (
              <div className="space-y-4">
                {criticalInspections.map((item) => (
                  <div key={item.id} className="border border-red-200 bg-red-50 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-semibold text-gray-900">{item.trainId}</span>
                      <span className={`text-xs font-medium ${getConfidenceColor(item.inspectionData?.confidence)}`}>
                        {item.inspectionData?.confidence}%
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-900 mb-1">{item.inspectionData?.part_name}</div>
                    <div className="text-xs text-gray-600 mb-2 line-clamp-2">{item.inspectionData?.description_of_issue}</div>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(item.inspectionData?.damage_status)}`}>
                        {item.inspectionData?.damage_status}
                      </span>
                      <span className="text-xs text-gray-500">{formatTimestamp(item.timestamp)}</span>
                    </div>
                    {/* Fix status for critical alert */}
                    <div className="mb-3">
                      <TaskStatusBadge taskInfo={inspectionTasks[item.id]} />
                    </div>
                    <div className="pt-2 border-t border-red-200">
                      <AssignBtn inspection={item} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* All Inspections Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <ImageIcon className="h-5 w-5 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">All Inspections</h3>
            </div>
            <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
              Export Report
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : inspections.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Camera className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium mb-2">No inspections yet</p>
              <p className="text-sm">Upload photos via the mobile app to see AI-powered analysis here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Train ID</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Part Name</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Damage Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Issue Description</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Replace</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Confidence</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Inspector</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Timestamp</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Fix Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((ins) => (
                    <tr key={ins.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4 text-sm font-medium text-gray-900">{ins.trainId || 'N/A'}</td>
                      <td className="py-4 px-4 text-sm text-gray-700">{ins.inspectionData?.part_name || 'Unknown'}</td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(ins.inspectionData?.damage_status)}`}>
                          {ins.inspectionData?.damage_status || 'N/A'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700 max-w-md">
                        <div className="line-clamp-2">{ins.inspectionData?.description_of_issue || 'No description available'}</div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getReplacementBadge(ins.inspectionData?.should_replace)}`}>
                          {ins.inspectionData?.should_replace || 'N/A'}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`text-sm font-semibold ${getConfidenceColor(ins.inspectionData?.confidence)}`}>
                          {ins.inspectionData?.confidence || 0}%
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700">
                        <div className="max-w-xs truncate" title={ins.userEmail}>
                          {ins.userName || ins.userEmail || 'N/A'}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-500">{formatTimestamp(ins.timestamp)}</td>
                      <td className="py-4 px-4">
                        <TaskStatusBadge taskInfo={inspectionTasks[ins.id]} />
                      </td>
                      <td className="py-4 px-4">
                        <AssignBtn inspection={ins} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PhotoInspections;