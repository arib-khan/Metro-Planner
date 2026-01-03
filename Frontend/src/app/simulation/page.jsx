"use client";
import React, { useState } from 'react';
import {  Settings, RotateCcw, Play } from 'lucide-react';

const SimulationAnalysis = () => {
  const [controls, setControls] = useState({
    fitnessExpiry: false,
    maintenanceDelays: false,
    highDemandPeriod: false,
    staffShortage: false
  });

  const [priorityList] = useState([
    { id: 'TS007', priority: 'Medium', reason: 'Scheduled maintenance', time: '4 hours' },
    { id: 'TS012', priority: 'Low', reason: 'Routine inspection', time: '2 hours' },
    { id: 'TS003', priority: 'High', reason: 'Mileage threshold', time: '6 hours' }
  ]);

  const toggleControl = (controlName) => {
    setControls(prev => ({
      ...prev,
      [controlName]: !prev[controlName]
    }));
  };

  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'High': return 'bg-gray-900 text-white';
      case 'Medium': return 'bg-gray-200 text-gray-700';
      case 'Low': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-500 text-white';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Simulation & What-If Analysis</h2>
            <p className="text-sm text-gray-500">Test scenarios and optimize induction scheduling</p>
          </div>
          <div className="flex space-x-3">
            <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </button>
            <button className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center">
              <Play className="h-4 w-4 mr-2" />
              Run Simulation
            </button>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Simulation Controls */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-6">
              <Settings className="h-5 w-5 mr-2 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">Simulation Controls</h3>
            </div>

            <div className="space-y-6">
              {/* Fitness Expiry */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">Fitness Expiry</h4>
                  <p className="text-xs text-gray-500">Simulate multiple trainsets approaching fitness expiry</p>
                </div>
                <button
                  onClick={() => toggleControl('fitnessExpiry')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 ${
                    controls.fitnessExpiry ? 'bg-gray-900' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      controls.fitnessExpiry ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Maintenance Delays */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">Maintenance Delays</h4>
                  <p className="text-xs text-gray-500">Add 50% extra time to all maintenance operations</p>
                </div>
                <button
                  onClick={() => toggleControl('maintenanceDelays')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 ${
                    controls.maintenanceDelays ? 'bg-gray-900' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      controls.maintenanceDelays ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* High Demand Period */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">High Demand Period</h4>
                  <p className="text-xs text-gray-500">Increase operational requirements by 30%</p>
                </div>
                <button
                  onClick={() => toggleControl('highDemandPeriod')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 ${
                    controls.highDemandPeriod ? 'bg-gray-900' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      controls.highDemandPeriod ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Staff Shortage */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">Staff Shortage</h4>
                  <p className="text-xs text-gray-500">Reduce available maintenance staff by 25%</p>
                </div>
                <button
                  onClick={() => toggleControl('staffShortage')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 ${
                    controls.staffShortage ? 'bg-gray-900' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      controls.staffShortage ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Current Induction Priority List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Current Induction Priority List</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Trainset ID</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Priority</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Reason</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Est. Time</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityList.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-4 px-4 text-sm font-medium text-gray-900">{item.id}</td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getPriorityColor(item.priority)}`}>
                          {item.priority}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700">{item.reason}</td>
                      <td className="py-4 px-4 text-sm text-gray-700">{item.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SimulationAnalysis;