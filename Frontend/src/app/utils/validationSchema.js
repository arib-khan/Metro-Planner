// utils/validationSchema.js
import * as Yup from 'yup';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const optionalDate = Yup.string()
  .matches(dateRegex, 'Use YYYY-MM-DD format')
  .nullable()
  .optional();

export const validationSchema = Yup.object().shape({
  trainId: Yup.string().required('Train ID is required'),
  entryDate: Yup.string()
    .required('Entry date is required')
    .matches(dateRegex, 'Use YYYY-MM-DD format'),

  // Master: fitness
  updateFitness: Yup.boolean(),
  fitnessStatus: Yup.string(),
  rollingStockValidity: optionalDate,
  signallingValidity: optionalDate,
  telecomValidity: optionalDate,

  // Master: branding
  updateBranding: Yup.boolean(),
  brandingType: Yup.string(),
  brandingPriorityLevel: Yup.string(),
  brandingExposureMinutes: Yup.string(),
  brandingValidFrom: optionalDate,
  brandingValidTo: optionalDate,
  brandingApprovedBy: Yup.string(),

  // Daily: cleaning
  cleaningType: Yup.string(),
  cleaningSlotStart: Yup.string(),
  cleaningSlotEnd: Yup.string(),
  cleaningAssignedTeam: Yup.string(),
  cleaningStatus: Yup.string(),

  // Daily: stabling
  yard: Yup.string(),
  trackNo: Yup.string(),
  berth: Yup.string(),
  orientation: Yup.string(),
  distanceFromBuffer: Yup.string(),
  stablingRemarks: Yup.string(),

  // Daily: mileage
  currentMileageKm: Yup.string(),

  // Daily: job (optional)
  jobId: Yup.string(),
  jobTask: Yup.string(),
  jobStatus: Yup.string(),
  jobAssignedTeam: Yup.string(),
  jobDueDate: optionalDate,
  jobPriority: Yup.string(),
});