"use client";
import React, { useState, useEffect } from 'react';
import { Camera, AlertTriangle, CheckCircle, Clock, TrendingUp, Wrench, Image as ImageIcon } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase/config';

const PhotoInspections = () => {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    damaged: 0,
    healthy: 0,
    replacementNeeded: 0,
    avgConfidence: 0
  });

  // Fetch inspections from Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'photoReports'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const inspectionsData = [];
      querySnapshot.forEach((doc) => {
        inspectionsData.push({
          id: doc.id,
          ...doc.data()
        });
      });

      setInspections(inspectionsData);
      // eslint-disable-next-line react-hooks/immutability
      calculateStats(inspectionsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching inspections:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Calculate statistics
  const calculateStats = (data) => {
    const damaged = data.filter(i =>
      i.inspectionData?.damage_status === 'damaged' ||
      i.inspectionData?.damage_status === 'severe'
    ).length;

    const healthy = data.filter(i =>
      i.inspectionData?.damage_status === 'not_damaged' ||
      i.inspectionData?.damage_status === 'good'
    ).length;

    const replacementNeeded = data.filter(i =>
      i.inspectionData?.should_replace === 'yes'
    ).length;

    const avgConf = data.length > 0
      ? data.reduce((acc, i) => acc + (i.inspectionData?.confidence || 0), 0) / data.length
      : 0;

    setStats({
      total: data.length,
      damaged,
      healthy,
      replacementNeeded,
      avgConfidence: avgConf.toFixed(1)
    });
  };

  // Get status badge styling
  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'damaged':
      case 'severe':
        return 'bg-red-100 text-red-800 border border-red-200';
      case 'moderate':
        return 'bg-orange-100 text-orange-800 border border-orange-200';
      case 'minor':
      case 'slight':
        return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'not_damaged':
      case 'good':
        return 'bg-green-100 text-green-800 border border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  // Get replacement badge styling
  const getReplacementBadge = (shouldReplace) => {
    switch (shouldReplace?.toLowerCase()) {
      case 'yes':
        return 'bg-red-500 text-white';
      case 'no':
        return 'bg-green-500 text-white';
      case 'monitor':
        return 'bg-orange-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence) => {
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 70) return 'text-orange-600';
    return 'text-red-600';
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';

    try {
      // Handle Firestore Timestamp
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      return 'N/A';
    }
  };

  // Get recent inspections (last 5)
  const recentInspections = inspections.slice(0, 5);

  // Get critical inspections (damaged + replacement needed)
  const criticalInspections = inspections.filter(i =>
    i.inspectionData?.damage_status === 'damaged' ||
    i.inspectionData?.should_replace === 'yes'
  ).slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
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
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Inspections</span>
              <ImageIcon className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-600 mt-1">All time</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Damaged Parts</span>
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div className="text-3xl font-bold text-red-600">{stats.damaged}</div>
            <div className="text-xs text-red-600 mt-1">Require attention</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Healthy Parts</span>
              <CheckCircle className="h-5 w-5 text-green-400" />
            </div>
            <div className="text-3xl font-bold text-green-600">{stats.healthy}</div>
            <div className="text-xs text-green-600 mt-1">No issues found</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Replacements</span>
              <Wrench className="h-5 w-5 text-orange-400" />
            </div>
            <div className="text-3xl font-bold text-orange-600">{stats.replacementNeeded}</div>
            <div className="text-xs text-orange-600 mt-1">Need replacement</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Avg Confidence</span>
              <TrendingUp className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.avgConfidence}%</div>
            <div className="text-xs text-gray-600 mt-1">AI accuracy</div>
          </div>
        </div>

        {/* Recent Inspections and Critical Alerts */}
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
                <p className="text-sm mt-1">Upload photos via the mobile app to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Train ID</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Part Name</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Status</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Replace</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Confidence</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInspections.map((inspection) => (
                      <tr key={inspection.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-4 text-sm font-medium text-gray-900">
                          {inspection.trainId || 'N/A'}
                        </td>
                        <td className="py-4 px-4 text-sm text-gray-700">
                          {inspection.inspectionData?.part_name || 'Unknown'}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(inspection.inspectionData?.damage_status)}`}>
                            {inspection.inspectionData?.damage_status || 'N/A'}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getReplacementBadge(inspection.inspectionData?.should_replace)}`}>
                            {inspection.inspectionData?.should_replace || 'N/A'}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`text-sm font-semibold ${getConfidenceColor(inspection.inspectionData?.confidence)}`}>
                            {inspection.inspectionData?.confidence || 0}%
                          </span>
                        </td>
                        <td className="py-4 px-4 text-sm text-gray-500">
                          {formatTimestamp(inspection.timestamp)}
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
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      {item.inspectionData?.part_name}
                    </div>
                    <div className="text-xs text-gray-600 mb-2 line-clamp-2">
                      {item.inspectionData?.description_of_issue}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(item.inspectionData?.damage_status)}`}>
                        {item.inspectionData?.damage_status}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(item.timestamp)}
                      </span>
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
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((inspection) => (
                    <tr key={inspection.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4 text-sm font-medium text-gray-900">
                        {inspection.trainId || 'N/A'}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700">
                        {inspection.inspectionData?.part_name || 'Unknown'}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(inspection.inspectionData?.damage_status)}`}>
                          {inspection.inspectionData?.damage_status || 'N/A'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700 max-w-md">
                        <div className="line-clamp-2">
                          {inspection.inspectionData?.description_of_issue || 'No description available'}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getReplacementBadge(inspection.inspectionData?.should_replace)}`}>
                          {inspection.inspectionData?.should_replace || 'N/A'}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`text-sm font-semibold ${getConfidenceColor(inspection.inspectionData?.confidence)}`}>
                          {inspection.inspectionData?.confidence || 0}%
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700">
                        <div className="max-w-xs truncate" title={inspection.userEmail}>
                          {inspection.userName || inspection.userEmail || 'N/A'}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-500">
                        {formatTimestamp(inspection.timestamp)}
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