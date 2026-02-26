"use client";
import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Wrench, TrendingUp, MapPin, RefreshCw, Download } from 'lucide-react';

const Scheduling = () => {
  // All Kochi Metro stations
  const stations = [
    'Aluva', 'Pulinchodu', 'Companypady', 'Ambattukavu', 'Muttom',
    'Kalamassery', 'CUSAT', 'Pathadipalam', 'Edappally', 'Changampuzha Park',
    'Palarivattom', 'JLN Stadium', 'Kaloor Town Hall', 'MG Road',
    'Maharaja\'s College', 'Ernakulam South', 'Kadavanthra', 'Elamkulam',
    'Vyttila', 'Thaikoodam', 'Petta', 'Vadakkekotta', 'SN Junction',
    'Tripunithura Terminal'
  ];

  // Train data from CSV
  const trainData = [
    { train_id: 'KMRL-1', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-2', fitness: 'Fit', status: 'Maintenance' },
    { train_id: 'KMRL-3', fitness: 'Unfit', status: 'Maintenance' },
    { train_id: 'KMRL-4', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-5', fitness: 'Fit', status: 'Maintenance' },
    { train_id: 'KMRL-6', fitness: 'Unfit', status: 'Maintenance' },
    { train_id: 'KMRL-7', fitness: 'Fit', status: 'Maintenance' },
    { train_id: 'KMRL-8', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-9', fitness: 'Unfit', status: 'Maintenance' },
    { train_id: 'KMRL-10', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-11', fitness: 'Fit', status: 'Maintenance' },
    { train_id: 'KMRL-12', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-13', fitness: 'Unfit', status: 'Maintenance' },
    { train_id: 'KMRL-14', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-15', fitness: 'Fit', status: 'Maintenance' },
    { train_id: 'KMRL-16', fitness: 'Unfit', status: 'Maintenance' },
    { train_id: 'KMRL-17', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-18', fitness: 'Fit', status: 'Maintenance' },
    { train_id: 'KMRL-19', fitness: 'Unfit', status: 'Maintenance' },
    { train_id: 'KMRL-20', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-21', fitness: 'Fit', status: 'Maintenance' },
    { train_id: 'KMRL-22', fitness: 'Unfit', status: 'Maintenance' },
    { train_id: 'KMRL-23', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-24', fitness: 'Fit', status: 'Maintenance' },
    { train_id: 'KMRL-25', fitness: 'Unfit', status: 'Maintenance' },
    { train_id: 'KMRL-26', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-27', fitness: 'Fit', status: 'Maintenance' },
    { train_id: 'KMRL-28', fitness: 'Unfit', status: 'Maintenance' },
    { train_id: 'KMRL-29', fitness: 'Fit', status: 'Operational' },
    { train_id: 'KMRL-30', fitness: 'Fit', status: 'Maintenance' },
  ];

  const [schedules, setSchedules] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [operationsTimeline, setOperationsTimeline] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate automatic schedule
  const generateSchedule = () => {
    setIsGenerating(true);
    
    // Get operational trains only (Fit and Operational)
    const operationalTrains = trainData.filter(
      train => train.fitness === 'Fit' && train.status === 'Operational'
    );

    // Get standby trains (Fit but in Maintenance)
    const standbyTrains = trainData.filter(
      train => train.fitness === 'Fit' && train.status === 'Maintenance'
    );

    // Get maintenance trains (Unfit)
    const maintenanceTrains = trainData.filter(
      train => train.fitness === 'Unfit'
    );

    const newSchedules = [];
    const newTimeline = [];
    const newOperationsTimeline = [];

    // Operating hours: 6 AM (6:00) to 11 PM (23:00)
    const startHour = 6;
    const endHour = 23;
    
    let currentTime = startHour * 60; // Convert to minutes
    const endTime = endHour * 60;
    
    let trainIndex = 0;
    let scheduleId = 0;

    // Generate schedules for operational trains
    while (currentTime < endTime && trainIndex < operationalTrains.length) {
      const train = operationalTrains[trainIndex];
      
      // Calculate journey duration (approximately 50-60 minutes for full route)
      const journeyDuration = Math.floor(Math.random() * 11) + 50; // 50-60 minutes
      
      // Check if there's enough time for this journey
      if (currentTime + journeyDuration > endTime) {
        break;
      }

      // Random direction
      const isNorthbound = Math.random() > 0.5;
      const origin = isNorthbound ? stations[stations.length - 1] : stations[0];
      const destination = isNorthbound ? stations[0] : stations[stations.length - 1];

      // Format time
      const departureHour = Math.floor(currentTime / 60);
      const departureMin = currentTime % 60;
      const departureTime = `${String(departureHour).padStart(2, '0')}:${String(departureMin).padStart(2, '0')}`;

      // Determine bay assignment
      const bay = `Bay ${(scheduleId % 3) + 1}`;

      // Add to schedules
      newSchedules.push({
        id: train.train_id,
        departure: departureTime,
        route: `${origin} → ${destination}`,
        status: 'On Time',
        bay: bay
      });

      // Add to timeline
      newTimeline.push({
        id: train.train_id,
        time: departureTime,
        route: `${origin} → ${destination}`,
        color: 'bg-green-500'
      });

      // Add to operations timeline
      newOperationsTimeline.push({
        id: train.train_id,
        start: currentTime / 60,
        duration: journeyDuration / 60,
        color: 'bg-green-500'
      });

      // Move to next time slot
      // Random break between 20-30 minutes
      const breakDuration = Math.floor(Math.random() * 11) + 20;
      currentTime += journeyDuration + breakDuration;
      
      scheduleId++;
      
      // Rotate through operational trains
      trainIndex = (trainIndex + 1) % operationalTrains.length;
    }

    // Add standby trains to schedule (not actively scheduled but available)
    standbyTrains.slice(0, 3).forEach(train => {
      newSchedules.push({
        id: train.train_id,
        departure: '—',
        route: 'Standby',
        status: 'Standby',
        bay: 'Depot'
      });

      newTimeline.push({
        id: train.train_id,
        time: 'Standby',
        route: 'Available for assignment',
        color: 'bg-orange-500'
      });
    });

    // Add maintenance trains
    maintenanceTrains.slice(0, 2).forEach(train => {
      newSchedules.push({
        id: train.train_id,
        departure: '—',
        route: 'Under Maintenance',
        status: 'Maintenance',
        bay: 'Workshop'
      });
    });

    setSchedules(newSchedules);
    setTimeline(newTimeline);
    setOperationsTimeline(newOperationsTimeline);
    
    setTimeout(() => setIsGenerating(false), 500);
  };

  // Generate schedule on component mount
  useEffect(() => {
    generateSchedule();
  }, []);

  const getStatusColor = (status) => {
    switch(status) {
      case 'On Time': return 'bg-gray-900 text-white';
      case 'Standby': return 'bg-orange-100 text-orange-700 border border-orange-300';
      case 'Maintenance': return 'bg-red-100 text-red-700 border border-red-300';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getTimelineWidth = (duration) => {
    return `${(duration / 24) * 100}%`;
  };

  const getTimelineLeft = (start) => {
    return `${(start / 24) * 100}%`;
  };

  // Calculate metrics
  const scheduledCount = schedules.filter(s => s.status === 'On Time').length;
  const standbyCount = schedules.filter(s => s.status === 'Standby').length;
  const maintenanceCount = schedules.filter(s => s.status === 'Maintenance').length;
  const totalOperational = trainData.filter(t => t.fitness === 'Fit' && t.status === 'Operational').length;
  const efficiency = ((scheduledCount / totalOperational) * 100).toFixed(1);

  // Export schedule as CSV
  const exportSchedule = () => {
    const csvContent = [
      ['Train ID', 'Departure Time', 'Route', 'Status', 'Bay'],
      ...schedules.map(s => [s.id, s.departure, s.route, s.status, s.bay])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `train_schedule_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 mr-3 text-gray-900" />
              <h2 className="text-3xl font-bold text-gray-900">Train Scheduling</h2>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={exportSchedule}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button 
                onClick={generateSchedule}
                disabled={isGenerating}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                Regenerate Schedule
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-600 max-w-4xl">
            Automated scheduling system that generates optimized train timetables from 6:00 AM to 11:00 PM with 20-30 minute breaks between trips. The system covers all {stations.length} stations on the Kochi Metro line and automatically adjusts schedules based on trainset fitness status and operational constraints.
          </p>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Scheduled</span>
              <Calendar className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{scheduledCount}</div>
            <div className="text-xs text-green-600 mt-1">Active trips today</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Standby Trains</span>
              <Clock className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{standbyCount}</div>
            <div className="text-xs text-gray-600 mt-1">{standbyCount} awaiting assignment</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">In Maintenance</span>
              <Wrench className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{maintenanceCount}</div>
            <div className="text-xs text-gray-600 mt-1">Unfit for operation</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Schedule Efficiency</span>
              <TrendingUp className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{efficiency}%</div>
            <div className="text-xs text-green-600 mt-1">Optimized allocation</div>
          </div>
        </div>

        {/* Today's Schedule and Daily Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Today's Schedule */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <MapPin className="h-5 w-5 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Today's Schedule</h3>
              <span className="ml-auto text-xs text-gray-500">{schedules.length} total entries</span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-white">
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
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
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
            <div className="space-y-4 max-h-[450px] overflow-y-auto">
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

        {/* Automatic Scheduling Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Automatic Scheduling System</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-gray-600 mb-4">System automatically handles:</div>
              <div className="space-y-2">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                  <span className="text-sm text-gray-700">Optimal time slot allocation (6 AM - 11 PM)</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                  <span className="text-sm text-gray-700">20-30 minute break intervals between trips</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                  <span className="text-sm text-gray-700">Standby train management and rotation</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
                  <span className="text-sm text-gray-700">Maintenance exclusions for unfit trains</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                  <span className="text-sm text-gray-700">Full route coverage across {stations.length} stations</span>
                </div>
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-4">Covered Stations ({stations.length}):</div>
              <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-y-auto text-xs text-gray-700">
                {stations.map((station, idx) => (
                  <div key={idx} className="flex items-center">
                    <div className="w-1 h-1 bg-gray-400 rounded-full mr-2"></div>
                    {station}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 24-Hour Operations Timeline */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-6">
            <Clock className="h-5 w-5 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">24-Hour Operations Timeline</h3>
            <span className="ml-auto text-xs text-gray-500">Operating Hours: 06:00 - 23:00</span>
          </div>
          
          {/* Time scale */}
          <div className="relative mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              {['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'].map((time, idx) => (
                <div key={idx} className="flex-1 text-center">{time}</div>
              ))}
            </div>
            <div className="w-full h-px bg-gray-200"></div>
            {/* Highlight operating hours */}
            <div 
              className="absolute top-0 h-6 bg-green-100 opacity-30"
              style={{ left: '25%', width: '70.83%' }}
            ></div>
          </div>

          {/* Timeline bars */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {operationsTimeline.map((operation, idx) => (
              <div key={idx} className="relative">
                <div className="flex items-center mb-1">
                  <span className="text-sm font-medium text-gray-900 w-20">{operation.id}</span>
                  <div className="flex-1 relative h-8 bg-gray-50 rounded">
                    <div 
                      className={`absolute h-full ${operation.color} rounded flex items-center justify-center`}
                      style={{
                        left: getTimelineLeft(operation.start),
                        width: getTimelineWidth(operation.duration)
                      }}
                    >
                      <span className="text-xs text-white font-medium">
                        {Math.round(operation.duration * 60)} min
                      </span>
                    </div>
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