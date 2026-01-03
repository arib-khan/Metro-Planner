//utils\validationSchema.js
import * as Yup from 'yup';

export const validationSchema = Yup.object().shape({
  // Train Information
  trainId: Yup.string().required('Train ID is required'),

  // Branding Priorities (optional)
  brandingPriorityLevel: Yup.string(),
  brandingType: Yup.string(),
  brandingValidFrom: Yup.string(),
  brandingValidTo: Yup.string(),
  brandingApprovedBy: Yup.string(),
  brandingRemarks: Yup.string(),

  // Cleaning Slots (optional)
  cleaningType: Yup.string(),
  cleaningSlotStart: Yup.string(),
  cleaningSlotEnd: Yup.string(),
  cleaningAssignedTeam: Yup.string(),
  cleaningStatus: Yup.string(),

  // Stabling Geometry (optional)
  yard: Yup.string(),
  trackNo: Yup.string(),
  berth: Yup.string(),
  orientation: Yup.string(),
  distanceFromBuffer: Yup.string(),
  stablingRemarks: Yup.string(),

  // Fitness Certificates (optional)
  rollingStockValidity: Yup.string(),
  signallingValidity: Yup.string(),
  telecomValidity: Yup.string(),
  fitnessStatus: Yup.string(),

  // Job Card Status (optional)
  jobId: Yup.string(),
  jobTask: Yup.string(),
  jobStatus: Yup.string(),
  jobAssignedTeam: Yup.string(),
  jobDueDate: Yup.string(),
  jobCompletedOn: Yup.string(),
  jobPriority: Yup.string(),

  // Mileage (optional)
  previousMileageKm: Yup.string(),
  currentMileageKm: Yup.string(),
  mileageRemarks: Yup.string(),
});