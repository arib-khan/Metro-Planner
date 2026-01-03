"use client";
import React, { useState } from 'react';
import { Calendar, Clock, Wrench, TrendingUp, MapPin } from 'lucide-react';

const Scheduling = () => {
  const [schedules] = useState([
    { id: 'T-001', departure: '06:30', route: 'Central Station → North Terminal', status: 'On Time', bay: 'Bay 1' },
    { id: 'T-003', departure: '08:15', route: 'South Junction → East Hub', status: 'Standby', bay: 'Bay 3' },
    { id: 'T-005', departure: '10:45', route: 'West Terminal → Central Station', status: 'On Time', bay: 'Bay 2' },
    { id: 'T-007', departure: '13:20', route: 'North Terminal → South Junction', status: 'On Time', bay: 'Bay 1' },
    { id: 'T-002', departure: '15:30', route: 'East Hub → West Terminal', status: 'Maintenance', bay: 'Workshop' },
    { id: 'T-009', departure: '17:45', route: 'Central Station → South Junction', status: 'Standby', bay: 'Bay 3' },
    { id: 'T-009', departure: '17:45', route: 'Central Station → South Junction', status: 'Standby', bay: 'Bay 3' }
  ]);

  const [timeline] = useState([
    { id: 'T-001', time: '06:30', route: 'Central Station → North Terminal', color: 'bg-green-500' },
    { id: 'T-003', time: '08:15', route: 'South Junction → East Hub', color: 'bg-orange-500' },
    { id: 'T-005', time: '10:45', route: 'West Terminal → Central Station', color: 'bg-green-500' },
    { id: 'T-007', time: '13:20', route: 'North Terminal → South Junction', color: 'bg-green-500' },
    { id: 'T-009', time: '17:45', route: 'Central Station → South Junction', color: 'bg-orange-500' }
  ]);

  const [operationsTimeline] = useState([
    { id: 'T-001', start: 6, duration: 2, color: 'bg-green-500' },
    { id: 'T-003', start: 8, duration: 2.5, color: 'bg-orange-500' },
    { id: 'T-005', start: 10.75, duration: 2.5, color: 'bg-green-500' },
    { id: 'T-007', start: 13.33, duration: 3.5, color: 'bg-green-500' },
    { id: 'T-009', start: 17.75, duration: 2.5, color: 'bg-orange-500' }
  ]);

  const getStatusColor = (status) => {
    switch(status) {
      case 'On Time': return 'bg-gray-900 text-white';
      case 'Standby': return 'bg-gray-200 text-gray-700';
      case 'Maintenance': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getTimelineWidth = (duration) => {
    return `${(duration / 24) * 100}%`;
  };

  const getTimelineLeft = (start) => {
    return `${(start / 24) * 100}%`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-6">
          <div className="flex items-center mb-2">
            <Calendar className="h-8 w-8 mr-3 text-gray-900" />
            <h2 className="text-3xl font-bold text-gray-900">Train Scheduling</h2>
          </div>
          <p className="text-sm text-gray-600 max-w-4xl">
            Automated scheduling system that generates optimized train timetables based on available time slots, trainset fitness status, and operational constraints. The system automatically adjusts schedules when trains are in maintenance or require standby status.
          </p>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Scheduled</span>
              <Calendar className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">3</div>
            <div className="text-xs text-green-600 mt-1">+5% from yesterday</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Standby Trains</span>
              <Clock className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">2</div>
            <div className="text-xs text-gray-600 mt-1">2 awaiting assignment</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">In Maintenance</span>
              <Wrench className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">1</div>
            <div className="text-xs text-green-600 mt-1">Down from 3 yesterday</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Schedule Efficiency</span>
              <TrendingUp className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">94.2%</div>
            <div className="text-xs text-green-600 mt-1">+2.1% optimization</div>
          </div>
        </div>

        {/* Today's Schedule and Daily Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Today's Schedule */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <MapPin className="h-5 w-5 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Today's Schedule</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Trainset ID</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Departure Time</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Route/Station</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase py-3 px-4">Assigned Bay</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((schedule, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-4 px-4 text-sm font-medium text-gray-900">{schedule.id}</td>
                      <td className="py-4 px-4 text-sm text-gray-700">{schedule.departure}</td>
                      <td className="py-4 px-4 text-sm text-gray-700">{schedule.route}</td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(schedule.status)}`}>
                          {schedule.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700">{schedule.bay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily Timeline */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <TrendingUp className="h-5 w-5 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Daily Timeline</h3>
            </div>
            <div className="text-xs text-gray-500 mb-4">Scheduled Departures</div>
            <div className="space-y-4">
              {timeline.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-900">{item.id}</span>
                    <span className="text-xs text-gray-500">{item.time}</span>
                  </div>
                  <div className={`h-2 ${item.color} rounded-full`}></div>
                  <div className="text-xs text-gray-600">{item.route}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Automatic Scheduling */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Automatic Scheduling</h3>
          <div className="text-sm text-gray-600 mb-4">System automatically handles:</div>
          <div className="space-y-2 mb-6">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">Optimal time slot allocation</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">Standby train management</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">Maintenance exclusions</span>
            </div>
          </div>
          <div className="flex justify-end">
            <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
              Regenerate Schedule
            </button>
          </div>
        </div>

        {/* 24-Hour Operations Timeline */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-6">
            <Clock className="h-5 w-5 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">24-Hour Operations Timeline</h3>
          </div>
          
          {/* Time scale */}
          <div className="relative mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              {['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'].map((time, idx) => (
                <div key={idx} className="flex-1 text-center">{time}</div>
              ))}
            </div>
            <div className="w-full h-px bg-gray-200"></div>
          </div>

          {/* Timeline bars */}
          <div className="space-y-6">
            {operationsTimeline.map((operation, idx) => (
              <div key={idx} className="relative">
                <div className="flex items-center mb-2">
                  <span className="text-sm font-medium text-gray-900 w-16">{operation.id}</span>
                  <div className="flex-1 relative h-8 bg-gray-50 rounded">
                    <div 
                      className={`absolute h-full ${operation.color} rounded`}
                      style={{
                        left: getTimelineLeft(operation.start),
                        width: getTimelineWidth(operation.duration)
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Scheduling;