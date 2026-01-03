// src/app/updates/page.jsx
"use client";

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Train, CheckCircle, XCircle, Clock, User, Calendar, AlertCircle, MessageSquare } from 'lucide-react';
import WhatsAppIntegration from '../components/WhatsAppIntegration';

const UpdatesPage = () => {
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUpdate, setSelectedUpdate] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    // Real-time listener for pending updates
    const q = query(
      collection(db, 'trainInduction'),
      where('status', '==', 'submitted')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updates = [];
      snapshot.forEach((doc) => {
        updates.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setPendingUpdates(updates);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching updates:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleApprove = async (updateId) => {
    setProcessingId(updateId);
    try {
      const updateRef = doc(db, 'trainInduction', updateId);
      await updateDoc(updateRef, {
        status: 'approved',
        approvedAt: serverTimestamp(),
        syncStatus: 'approved'
      });
      
      alert('Update approved successfully!');
      setSelectedUpdate(null);
    } catch (error) {
      console.error('Error approving update:', error);
      alert('Failed to approve update: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (updateId) => {
    setProcessingId(updateId);
    try {
      const updateRef = doc(db, 'trainInduction', updateId);
      await deleteDoc(updateRef);
      
      alert('Update rejected and deleted successfully!');
      setSelectedUpdate(null);
    } catch (error) {
      console.error('Error rejecting update:', error);
      alert('Failed to reject update: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const getTrainIds = (update) => {
    const ids = new Set();
    
    if (update.branding_priorities) {
      update.branding_priorities.forEach(item => ids.add(item.train_id));
    }
    if (update.cleaning_slots) {
      update.cleaning_slots.forEach(item => ids.add(item.train_id));
    }
    if (update.stabling_geometry) {
      update.stabling_geometry.forEach(item => ids.add(item.train_id));
    }
    
    return Array.from(ids);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading pending updates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900">Pending Updates</h2>
          <p className="text-sm text-gray-500">Review and approve train induction submissions</p>
        </div>
<WhatsAppIntegration/>
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Pending Approvals</span>
              <Clock className="h-5 w-5 text-orange-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{pendingUpdates.length}</div>
            <div className="text-xs text-gray-500 mt-1">Awaiting review</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Trains</span>
              <Train className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {pendingUpdates.reduce((acc, update) => acc + getTrainIds(update).length, 0)}
            </div>
            <div className="text-xs text-gray-500 mt-1">In pending updates</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Sources</span>
              <AlertCircle className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-sm text-gray-700 mt-2">
              Manual: {pendingUpdates.filter(u => u.source === 'manual_entry').length}
              <br />
              Bulk: {pendingUpdates.filter(u => u.source === 'bulk_upload').length}
            </div>
          </div>
        </div>

        {/* Updates List */}
        {pendingUpdates.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">All Caught Up!</h3>
            <p className="text-gray-600">There are no pending updates to review at this time.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {pendingUpdates.map((update) => (
              <div key={update.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Train IDs: {getTrainIds(update).join(', ')}
                    </h3>
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(update.timestamp)}
                    </div>
                  </div>
                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                    update.source === 'manual_entry' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-purple-100 text-purple-800'
                  }`}>
                    {update.source === 'manual_entry' ? 'Manual Entry' : 'Bulk Upload'}
                  </span>
                </div>

                {/* Submitter Info */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center text-sm">
                    <User className="h-4 w-4 mr-2 text-gray-600" />
                    <span className="font-medium text-gray-900">{update.userName}</span>
                    <span className="text-gray-500 ml-2">({update.userEmail})</span>
                  </div>
                  {update.source === 'whatsapp' && update.whatsappInfo && (
                    <div className="mt-2 flex items-center text-xs text-green-600">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Received via WhatsApp from {update.whatsappInfo.name}
                    </div>
                  )}
                </div>

                {/* Data Summary */}
                <div className="space-y-2 mb-4">
                  {update.branding_priorities && update.branding_priorities.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Branding:</span>
                      <span className="text-gray-600 ml-2">
                        {update.branding_priorities.length} record(s)
                      </span>
                    </div>
                  )}
                  {update.cleaning_slots && update.cleaning_slots.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Cleaning:</span>
                      <span className="text-gray-600 ml-2">
                        {update.cleaning_slots.length} record(s)
                      </span>
                    </div>
                  )}
                  {update.stabling_geometry && update.stabling_geometry.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Stabling:</span>
                      <span className="text-gray-600 ml-2">
                        {update.stabling_geometry.length} record(s)
                      </span>
                    </div>
                  )}
                  {update.fitness_certificates && update.fitness_certificates.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Fitness:</span>
                      <span className="text-gray-600 ml-2">
                        {update.fitness_certificates.length} record(s)
                      </span>
                    </div>
                  )}
                  {update.mileage && update.mileage.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Mileage:</span>
                      <span className="text-gray-600 ml-2">
                        {update.mileage.length} record(s)
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex space-x-3">
                  <button
                    onClick={() => setSelectedUpdate(update)}
                    className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => handleApprove(update.id)}
                    disabled={processingId === update.id}
                    className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
                  >
                    {processingId === update.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleReject(update.id)}
                    disabled={processingId === update.id}
                    className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
                  >
                    {processingId === update.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {selectedUpdate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      Update Details
                    </h3>
                    <p className="text-sm text-gray-500">
                      Submitted by {selectedUpdate.userName}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedUpdate(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XCircle className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Branding Priorities */}
                  {selectedUpdate.branding_priorities && selectedUpdate.branding_priorities.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">Branding Priorities</h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        {selectedUpdate.branding_priorities.map((item, idx) => (
                          <div key={idx} className="mb-3 last:mb-0">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div><span className="font-medium">Train ID:</span> {item.train_id}</div>
                              <div><span className="font-medium">Type:</span> {item.branding_type}</div>
                              <div><span className="font-medium">Priority:</span> {item.priority_level}</div>
                              <div><span className="font-medium">Approved By:</span> {item.approved_by}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cleaning Slots */}
                  {selectedUpdate.cleaning_slots && selectedUpdate.cleaning_slots.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">Cleaning Slots</h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        {selectedUpdate.cleaning_slots.map((item, idx) => (
                          <div key={idx} className="mb-3 last:mb-0">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div><span className="font-medium">Train ID:</span> {item.train_id}</div>
                              <div><span className="font-medium">Type:</span> {item.cleaning_type}</div>
                              <div><span className="font-medium">Team:</span> {item.assigned_team}</div>
                              <div><span className="font-medium">Status:</span> {item.status}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stabling Geometry */}
                  {selectedUpdate.stabling_geometry && selectedUpdate.stabling_geometry.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">Stabling Geometry</h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        {selectedUpdate.stabling_geometry.map((item, idx) => (
                          <div key={idx} className="mb-3 last:mb-0">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div><span className="font-medium">Train ID:</span> {item.train_id}</div>
                              <div><span className="font-medium">Yard:</span> {item.yard}</div>
                              <div><span className="font-medium">Track:</span> {item.track_no}</div>
                              <div><span className="font-medium">Berth:</span> {item.berth}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mileage */}
                  {selectedUpdate.mileage && selectedUpdate.mileage.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">Mileage Records</h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        {selectedUpdate.mileage.map((item, idx) => (
                          <div key={idx} className="mb-3 last:mb-0">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div><span className="font-medium">Train ID:</span> {item.train_id}</div>
                              <div><span className="font-medium">Current:</span> {item.current_mileage_km} km</div>
                              <div><span className="font-medium">Previous:</span> {item.previous_mileage_km} km</div>
                              <div><span className="font-medium">Delta:</span> {item.delta_km} km</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex space-x-3 mt-6">
                  <button
                    onClick={() => {
                      handleApprove(selectedUpdate.id);
                    }}
                    disabled={processingId === selectedUpdate.id}
                    className="flex-1 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Approve Update
                  </button>
                  <button
                    onClick={() => {
                      handleReject(selectedUpdate.id);
                    }}
                    disabled={processingId === selectedUpdate.id}
                    className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
                  >
                    <XCircle className="h-5 w-5 mr-2" />
                    Reject & Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default UpdatesPage;