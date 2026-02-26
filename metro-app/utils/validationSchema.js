//utils\validationSchema.js
import * as Yup from 'yup';

export const validationSchema = Yup.object().shape({
  // Train Information
  trainId: Yup.string().required('Train ID is required'),

  // Branding Priorities
  brandingPriorityLevel: Yup.string(),
  brandingType: Yup.string(),
  brandingValidFrom: Yup.string().matches(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').nullable(),
  brandingValidTo: Yup.string().matches(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').nullable(),
  brandingExposureMinutes: Yup.string(),
  brandingApprovedBy: Yup.string(),
  brandingRemarks: Yup.string(),

  // Cleaning Slots
  cleaningType: Yup.string(),
  cleaningSlotStart: Yup.string(),
  cleaningSlotEnd: Yup.string(),
  cleaningAssignedTeam: Yup.string(),
  cleaningStatus: Yup.string(),

  // Stabling Geometry
  yard: Yup.string(),
  trackNo: Yup.string(),
  berth: Yup.string(),
  orientation: Yup.string(),
  distanceFromBuffer: Yup.string(),
  stablingRemarks: Yup.string(),

  // Fitness Certificates — now stored as validity dates (not booleans)
  rollingStockValidity: Yup.string()
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
    .nullable(),
  signallingValidity: Yup.string()
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
    .nullable(),
  telecomValidity: Yup.string()
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
    .nullable(),
  fitnessStatus: Yup.string(),

  // Job Card Status
  jobId: Yup.string(),
  jobTask: Yup.string(),
  jobStatus: Yup.string(),
  jobAssignedTeam: Yup.string(),
  jobDueDate: Yup.string()
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
    .nullable(),
  jobCompletedOn: Yup.string()
    .matches(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
    .nullable(),
  jobPriority: Yup.string(),

  // Mileage — simplified: only current mileage needed
  currentMileageKm: Yup.string(),
});