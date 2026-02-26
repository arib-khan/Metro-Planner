//screens\InductionForm.js
import React, { useState } from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Button, Text, Snackbar } from 'react-native-paper';
import { Formik } from 'formik';
import FormSection from '../components/FormSection';
import { validationSchema } from '../utils/validationSchema';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../utils/authHelpers';

// ── Hardcoded fleet list for picker ──────────────────────────────────────────
export const TRAIN_IDS = Array.from({ length: 30 }, (_, i) => `KMRL-${i + 1}`);

const initialValues = {
  trainId: '',

  // Branding
  brandingPriorityLevel: '3',
  brandingType: 'None',
  brandingValidFrom: '',
  brandingValidTo: '',
  brandingExposureMinutes: '0',
  brandingApprovedBy: 'Marketing Dept',
  brandingRemarks: '',

  // Cleaning
  cleaningType: 'Daily Clean',
  cleaningSlotStart: '23:00',
  cleaningSlotEnd: '23:45',
  cleaningAssignedTeam: 'Team A',
  cleaningStatus: 'Scheduled',

  // Stabling
  yard: 'Muttom Depot',
  trackNo: '1',
  berth: 'A1',
  orientation: 'UP',
  distanceFromBuffer: '4.5',
  stablingRemarks: '',

  // Fitness — store validity dates (not just a status flag)
  rollingStockValidity: '',
  signallingValidity: '',
  telecomValidity: '',
  fitnessStatus: 'Fit for Service',

  // Job Card
  jobId: '',
  jobTask: '',
  jobStatus: 'Open',
  jobAssignedTeam: 'Maintenance Team',
  jobDueDate: '',
  jobCompletedOn: '',
  jobPriority: 'Medium',

  // Mileage — new format only needs current_mileage_km
  currentMileageKm: '0',
};

// ── Transform form values → exact new JSON format ─────────────────────────────
const transformToExactJSONFormat = (formData, user) => {
  const currentDate = new Date().toISOString().split('T')[0];

  const result = {
    date: currentDate,
    branding_priorities: [],
    cleaning_slots: [],
    stabling_geometry: [],
    fitness_certificates: [],
    job_card_status: [],
    mileage: [],
  };

  // Branding Priorities — only if not 'None'
  if (formData.brandingType && formData.brandingType !== 'None') {
    result.branding_priorities.push({
      train_id: formData.trainId,
      exposure_minutes: parseInt(formData.brandingExposureMinutes) || 0,
      priority_level: parseInt(formData.brandingPriorityLevel) || 3,
      branding_type: formData.brandingType,
      valid_from: formData.brandingValidFrom || currentDate,
      valid_to: formData.brandingValidTo || currentDate,
      approved_by: formData.brandingApprovedBy || 'Marketing Dept',
    });
  }

  // Cleaning Slots
  const slotDate = currentDate;
  result.cleaning_slots.push({
    train_id: formData.trainId,
    cleaning_type: formData.cleaningType || 'Daily Clean',
    slot_start: `${slotDate}T${formData.cleaningSlotStart || '23:00'}`,
    slot_end: `${slotDate}T${formData.cleaningSlotEnd || '23:45'}`,
    assigned_team: formData.cleaningAssignedTeam || 'Team A',
    status: formData.cleaningStatus || 'Scheduled',
  });

  // Stabling Geometry
  result.stabling_geometry.push({
    train_id: formData.trainId,
    yard: formData.yard || 'Muttom Depot',
    track_no: parseInt(formData.trackNo) || 1,
    berth: formData.berth || 'A1',
    orientation: formData.orientation || 'UP',
    distance_from_buffer_m: parseFloat(formData.distanceFromBuffer) || 4.5,
    remarks: formData.stablingRemarks || '',
  });

  // Fitness Certificates — store validity dates for each cert type
  // These will remain visible for any view date within the validity window
  result.fitness_certificates.push({
    train_id: formData.trainId,
    rolling_stock_validity: formData.rollingStockValidity || '',
    signalling_validity: formData.signallingValidity || '',
    telecom_validity: formData.telecomValidity || '',
    status: formData.fitnessStatus || 'Fit for Service',
  });

  // Job Card Status — only if task or ID provided
  if (formData.jobTask || formData.jobId) {
    const jobCard = {
      train_id: formData.trainId,
      job_id: formData.jobId || `JC-${Math.floor(Math.random() * 9000) + 1000}`,
      task: formData.jobTask || '',
      status: formData.jobStatus || 'Open',
      assigned_team: formData.jobAssignedTeam || 'Maintenance Team',
      due_date: formData.jobDueDate || currentDate,
      priority: formData.jobPriority || 'Medium',
    };
    if (formData.jobCompletedOn) jobCard.completed_on = formData.jobCompletedOn;
    result.job_card_status.push(jobCard);
  }

  // Mileage — new format: only current_mileage_km
  result.mileage.push({
    train_id: formData.trainId,
    current_mileage_km: parseInt(formData.currentMileageKm) || 0,
  });

  // Metadata
  result.userId = user.uid;
  result.userName = user.displayName || user.email;
  result.userEmail = user.email;
  result.timestamp = serverTimestamp();
  result.status = 'submitted';
  result.syncStatus = 'synced';
  result.source = 'manual_entry';

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────

export default function InductionForm({ navigation }) {
  const { user } = useAuth();
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values, { resetForm }) => {
    setLoading(true);
    try {
      const jsonData = transformToExactJSONFormat(values, user);
      console.log('Submitting data:', JSON.stringify(jsonData, null, 2));

      const docRef = await addDoc(collection(db, 'trainInduction'), jsonData);
      console.log('✅ Successfully saved with ID:', docRef.id);

      setSnackbarMessage('Form submitted successfully!');
      setSnackbarVisible(true);
      Alert.alert('Success', 'Train induction form submitted successfully!');
      resetForm();

      setTimeout(() => {
        navigation.navigate('Success', {
          documentId: docRef.id,
          isOffline: false,
        });
      }, 1500);
    } catch (error) {
      console.error('Submission error:', error);
      Alert.alert('Error', 'Failed to submit form: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ handleSubmit, values, setFieldValue, errors, touched }) => (
            <View style={{ padding: 16 }}>
              <Text variant="headlineMedium" style={{ marginBottom: 10, textAlign: 'center', fontWeight: 'bold' }}>
                Train Induction Form
              </Text>
              <Text variant="bodyMedium" style={{ marginBottom: 20, textAlign: 'center', color: 'gray' }}>
                Fill in the details for train induction
              </Text>

              {/* Train Information */}
              <FormSection
                title="🚆 Train Information"
                fields={[
                  {
                    name: 'trainId',
                    label: 'Train ID *',
                    type: 'select',
                    options: TRAIN_IDS,
                  },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Branding Priorities */}
              <FormSection
                title="🎨 Branding Priority"
                fields={[
                  {
                    name: 'brandingType',
                    label: 'Branding Type',
                    type: 'select',
                    options: ['None', 'Election Awareness', 'Tourism', 'Government Campaign', 'Commercial'],
                  },
                  {
                    name: 'brandingPriorityLevel',
                    label: 'Priority Level',
                    type: 'select',
                    options: ['1', '2', '3'],
                  },
                  {
                    name: 'brandingExposureMinutes',
                    label: 'Exposure Minutes',
                    type: 'number',
                    placeholder: '3600',
                  },
                  {
                    name: 'brandingValidFrom',
                    label: 'Valid From (YYYY-MM-DD)',
                    type: 'text',
                    placeholder: '2025-11-01',
                  },
                  {
                    name: 'brandingValidTo',
                    label: 'Valid To (YYYY-MM-DD)',
                    type: 'text',
                    placeholder: '2025-11-30',
                  },
                  {
                    name: 'brandingApprovedBy',
                    label: 'Approved By',
                    type: 'text',
                  },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Cleaning Slots */}
              <FormSection
                title="🧹 Cleaning Slots"
                fields={[
                  {
                    name: 'cleaningType',
                    label: 'Cleaning Type',
                    type: 'select',
                    options: ['Daily Clean', 'Detailing', 'Weekly Maintenance'],
                  },
                  {
                    name: 'cleaningSlotStart',
                    label: 'Slot Start Time (HH:MM)',
                    type: 'text',
                    placeholder: '23:00',
                  },
                  {
                    name: 'cleaningSlotEnd',
                    label: 'Slot End Time (HH:MM)',
                    type: 'text',
                    placeholder: '23:45',
                  },
                  {
                    name: 'cleaningAssignedTeam',
                    label: 'Assigned Team',
                    type: 'text',
                  },
                  {
                    name: 'cleaningStatus',
                    label: 'Status',
                    type: 'select',
                    options: ['Scheduled', 'In Progress', 'Completed'],
                  },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Stabling Geometry */}
              <FormSection
                title="📍 Stabling Geometry"
                fields={[
                  {
                    name: 'yard',
                    label: 'Yard',
                    type: 'select',
                    options: ['Muttom Depot', 'Kalamassery Depot'],
                  },
                  {
                    name: 'trackNo',
                    label: 'Track Number',
                    type: 'number',
                  },
                  {
                    name: 'berth',
                    label: 'Berth',
                    type: 'text',
                  },
                  {
                    name: 'orientation',
                    label: 'Orientation',
                    type: 'select',
                    options: ['UP', 'DN'],
                  },
                  {
                    name: 'distanceFromBuffer',
                    label: 'Distance from Buffer (m)',
                    type: 'number',
                  },
                  {
                    name: 'stablingRemarks',
                    label: 'Remarks',
                    type: 'textarea',
                  },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Fitness Certificates */}
              <FormSection
                title="✅ Fitness Certificates"
                fields={[
                  {
                    name: 'fitnessStatus',
                    label: 'Fitness Status',
                    type: 'select',
                    options: ['Fit for Service', 'Requires Check'],
                  },
                  {
                    name: 'rollingStockValidity',
                    label: 'Rolling Stock Valid Until (YYYY-MM-DD)',
                    type: 'text',
                    placeholder: '2025-12-10',
                  },
                  {
                    name: 'signallingValidity',
                    label: 'Signalling Valid Until (YYYY-MM-DD)',
                    type: 'text',
                    placeholder: '2025-12-07',
                  },
                  {
                    name: 'telecomValidity',
                    label: 'Telecom Valid Until (YYYY-MM-DD)',
                    type: 'text',
                    placeholder: '2025-12-15',
                  },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Job Card Status */}
              <FormSection
                title="🔧 Job Card Status (Optional)"
                fields={[
                  {
                    name: 'jobId',
                    label: 'Job ID',
                    type: 'text',
                    placeholder: 'JC-4471',
                  },
                  {
                    name: 'jobTask',
                    label: 'Task Description',
                    type: 'textarea',
                    placeholder: 'Brake Inspection',
                  },
                  {
                    name: 'jobStatus',
                    label: 'Status',
                    type: 'select',
                    options: ['Open', 'Pending', 'Completed'],
                  },
                  {
                    name: 'jobPriority',
                    label: 'Priority',
                    type: 'select',
                    options: ['Low', 'Medium', 'High'],
                  },
                  {
                    name: 'jobAssignedTeam',
                    label: 'Assigned Team',
                    type: 'text',
                  },
                  {
                    name: 'jobDueDate',
                    label: 'Due Date (YYYY-MM-DD)',
                    type: 'text',
                    placeholder: '2025-11-23',
                  },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Mileage — simplified to current only */}
              <FormSection
                title="📊 Mileage"
                fields={[
                  {
                    name: 'currentMileageKm',
                    label: 'Current Mileage (km)',
                    type: 'number',
                    placeholder: '288650',
                  },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                style={{
                  marginTop: 20,
                  marginBottom: 30,
                  paddingVertical: 8,
                  backgroundColor: '#1e293b',
                }}
                icon="send"
              >
                {loading ? 'Submitting...' : 'Submit Induction Form'}
              </Button>

              <Text variant="bodySmall" style={{ textAlign: 'center', color: 'gray', marginBottom: 20 }}>
                * Required fields
              </Text>
            </View>
          )}
        </Formik>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{ backgroundColor: '#4CAF50' }}
      >
        {snackbarMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}