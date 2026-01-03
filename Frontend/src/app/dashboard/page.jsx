// src/app/dashboard/page.jsx
"use client";

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Train, Calendar, Users, FileText, Bell, Settings, TrendingUp, CheckCircle, Clock, AlertTriangle, MessageSquare, Phone } from 'lucide-react';

const RailwayDashboard = () => {
  const [approvedData, setApprovedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trainsets, setTrainsets] = useState([]);

  useEffect(() => {
    // Real-time listener for approved updates
    const q = query(
      collection(db, 'trainInduction'),
      where('status', '==', 'approved')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => {
        data.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setApprovedData(data);
      processTrainData(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching approved data:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const processTrainData = (data) => {
    const trainsMap = new Map();

    data.forEach(record => {
      // Process mileage data
      if (record.mileage) {
        record.mileage.forEach(m => {
          if (!trainsMap.has(m.train_id)) {
            trainsMap.set(m.train_id, {
              id: m.train_id,
              mileage: m.current_mileage_km.toLocaleString(),
              fitness: 'Fit',
              jobCards: 0,
              branding: 'Standard',
              status: 'Operational'
            });
          }
        });
      }

      // Process fitness certificates
      if (record.fitness_certificates) {
        record.fitness_certificates.forEach(fc => {
          const train = trainsMap.get(fc.train_id);
          if (train) {
            train.fitness = fc.status === 'Fit for Service' ? 'Fit' : 'Unfit';
          }
        });
      }

      // Process branding
      if (record.branding_priorities) {
        record.branding_priorities.forEach(bp => {
          const train = trainsMap.get(bp.train_id);
          if (train) {
            train.branding = bp.branding_type;
          }
        });
      }

      // Process job cards
      if (record.job_card_status) {
        record.job_card_status.forEach(jc => {
          const train = trainsMap.get(jc.train_id);
          if (train && jc.status !== 'Completed') {
            train.jobCards += 1;
            train.status = 'Maintenance';
          }
        });
      }
    });

    setTrainsets(Array.from(trainsMap.values()));
  };

  const [activeAlerts] = useState([
    { id: 'TS009', type: 'Fitness Expiry', time: '2 hours ago', severity: 'critical' },
    { id: 'TS015', type: 'SLA Breach', time: '30 minutes ago', severity: 'warning' },
    { id: 'TS021', type: 'Conflict', time: '1 hour ago', severity: 'pending' }
  ]);

  const [aiSuggestions] = useState([
    { id: 'TS007', message: 'Mileage threshold exceeded', severity: 'High' },
    { id: 'TS012', message: 'Scheduled maintenance due', severity: 'Medium' },
    { id: 'TS003', message: 'Preventive inspection recommended', severity: 'Low' }
  ]);

  const [pendingUpdates] = useState([
    { name: 'John Smith', trainset: 'TS008', type: 'Inspection', time: '15 min ago' },
    { name: 'Sarah Wilson', trainset: 'TS014', type: 'Maintenance', time: '1 hour ago' },
    { name: 'Mike Johnson', trainset: 'TS020', type: 'Check', time: '2 hours ago' }
  ]);

  // Calculate fitness distribution
  const fitnessData = React.useMemo(() => {
    const fit = trainsets.filter(t => t.fitness === 'Fit').length;
    const total = trainsets.length || 1;
    return [
      { name: 'Fit', value: fit, color: '#10b981' },
      { name: 'Unfit', value: total - fit, color: '#ef4444' }
    ];
  }, [trainsets]);

  // Calculate job cards data
  const jobCardsData = React.useMemo(() => {
    return trainsets.slice(0, 5).map(t => ({
      name: t.id,
      value: t.jobCards
    }));
  }, [trainsets]);

  // Mileage trend (mock data for now)
  const mileageTrendData = [
    { month: 'Jan', value: 115000 },
    { month: 'Feb', value: 120000 },
    { month: 'Mar', value: 125000 },
    { month: 'Apr', value: 128000 },
    { month: 'May', value: 132000 },
    { month: 'Jun', value: 140000 }
  ];

  const getFitnessColor = (fitness) => {
    switch(fitness) {
      case 'Fit': return 'bg-green-500';
      case 'Unfit': return 'bg-red-500';
      case 'Due Soon': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'Operational': return 'bg-green-500';
      case 'Maintenance': return 'bg-orange-500';
      case 'Service Due': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'High': case 'critical': return 'bg-red-500';
      case 'Medium': case 'warning': return 'bg-orange-500';
      case 'Low': case 'pending': return 'bg-gray-400';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Railway Dashboard</h2>
            <p className="text-sm text-gray-500">Induction & Monitoring System</p>
          </div>
          <div className="flex items-center space-x-4">
            <button className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              <Bell className="h-4 w-4 mr-2" />
              Alerts (7)
            </button>
            <Settings className="h-5 w-5 text-gray-600 cursor-pointer" />
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Trainsets</span>
              <Train className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{trainsets.length}</div>
            <div className="text-xs text-green-600 mt-1">From approved data</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Fitness %</span>
              <CheckCircle className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {trainsets.length > 0 
                ? Math.round((trainsets.filter(t => t.fitness === 'Fit').length / trainsets.length) * 100)
                : 0}%
            </div>
            <div className="text-xs text-green-600 mt-1">Real-time data</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Pending Job Cards</span>
              <Clock className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {trainsets.reduce((acc, t) => acc + t.jobCards, 0)}
            </div>
            <div className="text-xs text-red-600 mt-1">Active maintenance</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">SLA Compliance</span>
              <TrendingUp className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">94%</div>
            <div className="text-xs text-green-600 mt-1">+1% this week</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Active Alerts</span>
              <AlertTriangle className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">7</div>
            <div className="text-xs text-red-600 mt-1">3 critical</div>
          </div>
        </div>

        {/* Trainset Overview and AI Suggestions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <Train className="h-5 w-5 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Trainset Overview</h3>
              <span className="ml-auto text-sm text-green-600">● Live Data</span>
            </div>
            {trainsets.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No approved train data yet. Approve updates to see data here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">ID</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Fitness</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Mileage</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Job Cards</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Branding</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainsets.map((trainset, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-4 px-4 text-sm font-medium text-gray-900">{trainset.id}</td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium text-white rounded-full ${getFitnessColor(trainset.fitness)}`}>
                            {trainset.fitness}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-sm text-gray-700">{trainset.mileage}</td>
                        <td className="py-4 px-4 text-sm text-gray-700">{trainset.jobCards}</td>
                        <td className="py-4 px-4 text-sm text-gray-700">{trainset.branding}</td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium text-white rounded-full ${getStatusColor(trainset.status)}`}>
                            {trainset.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Induction Suggestions</h3>
            <div className="space-y-4">
              {aiSuggestions.map((suggestion, idx) => (
                <div key={idx} className="border-b border-gray-100 pb-4 last:border-0">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-semibold text-gray-900">{suggestion.id}</span>
                    <span className={`text-xs px-2 py-1 text-white rounded-full ${getSeverityColor(suggestion.severity)}`}>
                      {suggestion.severity}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{suggestion.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Fitness Distribution</h3>
            {fitnessData[0].value === 0 && fitnessData[1].value === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-gray-500">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={fitnessData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {fitnessData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Pending Job Cards</h3>
            {jobCardsData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-gray-500">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={jobCardsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#1f2937" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Mileage Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={mileageTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Active Alerts and Pending Updates */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900">Active Alerts</h3>
              </div>
              <div className="flex space-x-2">
                <button className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  SMS
                </button>
                <button className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center">
                  <Phone className="h-3 w-3 mr-1" />
                  WhatsApp
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {activeAlerts.map((alert, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{alert.type}</div>
                    <div className="text-xs text-gray-500">{alert.id} • {alert.time}</div>
                  </div>
                  <span className={`text-xs px-3 py-1 text-white rounded-full ${getSeverityColor(alert.severity)}`}>
                    {alert.severity}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Pending Updates</h3>
            <div className="space-y-3">
              {pendingUpdates.map((update, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{update.name}</div>
                    <div className="text-xs text-gray-500">{update.trainset} • {update.type} • {update.time}</div>
                  </div>
                  <div className="flex space-x-2">
                    <button className="px-3 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded">
                      Approve
                    </button>
                    <button className="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded">
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RailwayDashboard;