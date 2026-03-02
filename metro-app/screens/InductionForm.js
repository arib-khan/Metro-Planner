// screens/InductionForm.js
import React, { useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Button, Text, Snackbar } from 'react-native-paper';
import { Formik } from 'formik';
import FormSection from '../components/FormSection';
import { validationSchema } from '../utils/validationSchema';
import { useAuth } from '../utils/authHelpers';
import {
  saveMasterData,
  saveDailyData,
  checkCertAlerts,
  checkBrandingAlerts,
} from '../utils/trainDataService';

// ── Fleet ─────────────────────────────────────────────────────────────────────
export const TRAIN_IDS = Array.from({ length: 30 }, (_, i) => `KMRL-${i + 1}`);
const todayStr = () => new Date().toISOString().split('T')[0];

// ── Initial values ────────────────────────────────────────────────────────────
const initialValues = {
  trainId: '',
  entryDate: todayStr(),          // User can change to any past/future date

  // Master data flags — only sent to trainMasterData if toggled ON
  updateFitness: false,
  fitnessStatus: 'Fit for Service',
  rollingStockValidity: '',
  signallingValidity: '',
  telecomValidity: '',

  updateBranding: false,
  brandingType: 'None',
  brandingPriorityLevel: '2',
  brandingExposureMinutes: '3600',
  brandingValidFrom: '',
  brandingValidTo: '',
  brandingApprovedBy: 'Marketing Dept',

  // Daily ops data — always sent to trainDailyData for the chosen date
  cleaningType: 'Daily Clean',
  cleaningSlotStart: '23:00',
  cleaningSlotEnd: '23:45',
  cleaningAssignedTeam: 'Team A',
  cleaningStatus: 'Scheduled',

  yard: 'Muttom Depot',
  trackNo: '1',
  berth: 'A1',
  orientation: 'UP',
  distanceFromBuffer: '4.5',
  stablingRemarks: '',

  currentMileageKm: '',

  jobId: '',
  jobTask: '',
  jobStatus: 'Open',
  jobAssignedTeam: 'Maintenance Team',
  jobDueDate: '',
  jobPriority: 'Medium',
};

// ── Build Firestore payloads ───────────────────────────────────────────────────
const buildPayloads = (v) => {
  const date = v.entryDate || todayStr();

  const masterPayload = {
    fitness_certificates: v.updateFitness ? {
      rolling_stock_validity: v.rollingStockValidity,
      signalling_validity: v.signallingValidity,
      telecom_validity: v.telecomValidity,
      status: v.fitnessStatus,
    } : undefined,
    branding_priorities: v.updateBranding
      ? (v.brandingType !== 'None' ? [{
        branding_type: v.brandingType,
        priority_level: parseInt(v.brandingPriorityLevel) || 2,
        exposure_minutes: parseInt(v.brandingExposureMinutes) || 0,
        valid_from: v.brandingValidFrom || date,
        valid_to: v.brandingValidTo || date,
        approved_by: v.brandingApprovedBy,
      }] : [])
      : undefined,
  };

  const dailyPayload = {
    date,
    cleaning_slots: [{
      cleaning_type: v.cleaningType,
      slot_start: `${date}T${v.cleaningSlotStart || '23:00'}`,
      slot_end: `${date}T${v.cleaningSlotEnd || '23:45'}`,
      assigned_team: v.cleaningAssignedTeam,
      status: v.cleaningStatus,
    }],
    stabling_geometry: {
      yard: v.yard,
      track_no: parseInt(v.trackNo) || 1,
      berth: v.berth,
      orientation: v.orientation,
      distance_from_buffer_m: parseFloat(v.distanceFromBuffer) || 4.5,
      remarks: v.stablingRemarks,
    },
    mileage: v.currentMileageKm
      ? { current_mileage_km: parseInt(v.currentMileageKm) }
      : null,
    job_card_status: v.jobTask || v.jobId ? [{
      job_id: v.jobId || `JC-${Math.floor(Math.random() * 9000) + 1000}`,
      task: v.jobTask,
      status: v.jobStatus,
      assigned_team: v.jobAssignedTeam,
      due_date: v.jobDueDate || date,
      priority: v.jobPriority,
    }] : [],
  };

  return { masterPayload, dailyPayload };
};

// ─────────────────────────────────────────────────────────────────────────────

export default function InductionForm({ navigation }) {
  const { user } = useAuth();
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values, { resetForm }) => {
    const date = values.entryDate || todayStr();
    const meta = { userId: user.uid, userName: user.displayName || user.email, userEmail: user.email };

    // ── Expiry checks before saving ────────────────────────────────────────────
    const alerts = [];
    if (values.updateFitness) {
      alerts.push(...checkCertAlerts({
        rolling_stock_validity: values.rollingStockValidity,
        signalling_validity: values.signallingValidity,
        telecom_validity: values.telecomValidity,
      }, date, values.trainId));
    }
    if (values.updateBranding && values.brandingType !== 'None') {
      alerts.push(...checkBrandingAlerts(
        [{ branding_type: values.brandingType, valid_to: values.brandingValidTo }],
        date, values.trainId
      ));
    }

    const expired = alerts.filter(a => a.type === 'expired');
    const warnings = alerts.filter(a => a.type === 'warning');

    // ── Perform the actual save ────────────────────────────────────────────────
    const doSave = async () => {
      setLoading(true);
      try {
        const { masterPayload, dailyPayload } = buildPayloads(values);
        const saves = [];

        if (values.updateFitness || values.updateBranding) {
          saves.push(saveMasterData({ trainId: values.trainId, ...masterPayload, ...meta }));
        }
        saves.push(saveDailyData({ trainId: values.trainId, ...dailyPayload, ...meta }));

        const results = await Promise.all(saves);
        const failed = results.filter(r => !r.success);

        if (failed.length) {
          Alert.alert('Partial Error', failed.map(f => f.error).join('\n'));
        } else {
          setSnackbarMsg(`✅ Saved for ${values.trainId} on ${date}`);
          setSnackbarVisible(true);
          resetForm({ values: { ...initialValues, entryDate: date } });
          setTimeout(() => navigation.navigate('Home'), 1500);
        }
      } catch (err) {
        Alert.alert('Error', err.message);
      } finally {
        setLoading(false);
      }
    };

    // Show expired alert (blocking) → save anyway option
    if (expired.length > 0) {
      Alert.alert(
        '🚨 Expired Data',
        expired.map(a => `• ${a.message}`).join('\n'),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save Anyway', style: 'destructive', onPress: doSave },
        ]
      );
      return;
    }

    // Show warning (expiring soon) → confirm
    if (warnings.length > 0) {
      Alert.alert(
        '⚠️ Expiry Warning',
        warnings.map(a => `• ${a.message}`).join('\n') + '\n\nProceed?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: doSave },
        ]
      );
      return;
    }

    await doSave();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        <Formik initialValues={initialValues} validationSchema={validationSchema} onSubmit={handleSubmit}>
          {({ handleSubmit: fSubmit, values, setFieldValue, errors, touched }) => (
            <View style={{ padding: 16 }}>
              <Text variant="headlineMedium" style={{ marginBottom: 4, textAlign: 'center', fontWeight: 'bold' }}>
                Train Induction Form
              </Text>
              <Text variant="bodySmall" style={{ marginBottom: 20, textAlign: 'center', color: '#888' }}>
                Enter data for any date • Toggle fitness/branding to override master record
              </Text>

              {/* Train + Date */}
              <FormSection
                title="🚆 Train & Date"
                fields={[
                  { name: 'trainId', label: 'Train ID *', type: 'select', options: TRAIN_IDS },
                  { name: 'entryDate', label: 'Entry Date (YYYY-MM-DD) *', type: 'text', placeholder: todayStr() },
                ]}
                values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
              />

              {/* Fitness (master) */}
              <FormSection
                title="✅ Fitness Certificates  [Master — overrides]"
                fields={[
                  { name: 'updateFitness', label: 'Update fitness record?', type: 'toggle' },
                  ...(values.updateFitness ? [
                    { name: 'fitnessStatus', label: 'Status', type: 'select', options: ['Fit for Service', 'Requires Check'] },
                    { name: 'rollingStockValidity', label: 'Rolling Stock Valid Until', type: 'text', placeholder: '2026-12-31' },
                    { name: 'signallingValidity', label: 'Signalling Valid Until', type: 'text', placeholder: '2026-12-31' },
                    { name: 'telecomValidity', label: 'Telecom Valid Until', type: 'text', placeholder: '2026-12-31' },
                  ] : []),
                ]}
                values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
              />

              {/* Branding (master) */}
              <FormSection
                title="🎨 Branding Priority  [Master — overrides]"
                fields={[
                  { name: 'updateBranding', label: 'Update branding record?', type: 'toggle' },
                  ...(values.updateBranding ? [
                    {
                      name: 'brandingType', label: 'Branding Type', type: 'select',
                      options: ['None', 'Election Awareness', 'Tourism', 'Government Campaign', 'Commercial'],
                    },
                    ...(values.brandingType !== 'None' ? [
                      { name: 'brandingPriorityLevel', label: 'Priority Level', type: 'select', options: ['1', '2', '3'] },
                      { name: 'brandingExposureMinutes', label: 'Exposure Minutes', type: 'number', placeholder: '3600' },
                      { name: 'brandingValidFrom', label: 'Valid From (YYYY-MM-DD)', type: 'text', placeholder: '2026-02-01' },
                      { name: 'brandingValidTo', label: 'Valid To (YYYY-MM-DD)', type: 'text', placeholder: '2026-02-28' },
                      { name: 'brandingApprovedBy', label: 'Approved By', type: 'text' },
                    ] : []),
                  ] : []),
                ]}
                values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
              />

              <Text variant="labelSmall" style={{ textAlign: 'center', color: '#aaa', marginVertical: 10, letterSpacing: 1 }}>
                ────── DAILY OPERATIONS DATA ──────
              </Text>

              {/* Cleaning (daily) */}
              <FormSection
                title="🧹 Cleaning Slot  [Daily]"
                fields={[
                  { name: 'cleaningType', label: 'Type', type: 'select', options: ['Daily Clean', 'Detailing', 'Weekly Maintenance'] },
                  { name: 'cleaningSlotStart', label: 'Start Time (HH:MM)', type: 'text', placeholder: '23:00' },
                  { name: 'cleaningSlotEnd', label: 'End Time (HH:MM)', type: 'text', placeholder: '23:45' },
                  { name: 'cleaningAssignedTeam', label: 'Assigned Team', type: 'text' },
                  { name: 'cleaningStatus', label: 'Status', type: 'select', options: ['Scheduled', 'In Progress', 'Completed'] },
                ]}
                values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
              />

              {/* Stabling (daily) */}
              <FormSection
                title="📍 Stabling  [Daily]"
                fields={[
                  { name: 'yard', label: 'Yard', type: 'select', options: ['Muttom Depot', 'Kalamassery Depot'] },
                  { name: 'trackNo', label: 'Track No', type: 'number' },
                  { name: 'berth', label: 'Berth', type: 'text' },
                  { name: 'orientation', label: 'Orientation', type: 'select', options: ['UP', 'DN'] },
                  { name: 'distanceFromBuffer', label: 'Distance from Buffer (m)', type: 'number' },
                  { name: 'stablingRemarks', label: 'Remarks', type: 'textarea' },
                ]}
                values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
              />

              {/* Mileage (daily) */}
              <FormSection
                title="📊 Mileage  [Daily]"
                fields={[
                  { name: 'currentMileageKm', label: 'Current Mileage (km)', type: 'number', placeholder: '288650' },
                ]}
                values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
              />

              {/* Jobs (daily, optional) */}
              <FormSection
                title="🔧 Job Card  [Daily, Optional]"
                fields={[
                  { name: 'jobId', label: 'Job ID', type: 'text', placeholder: 'JC-4471' },
                  { name: 'jobTask', label: 'Task Description', type: 'textarea' },
                  { name: 'jobStatus', label: 'Status', type: 'select', options: ['Open', 'Pending', 'Completed'] },
                  { name: 'jobPriority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
                  { name: 'jobAssignedTeam', label: 'Assigned Team', type: 'text' },
                  { name: 'jobDueDate', label: 'Due Date (YYYY-MM-DD)', type: 'text' },
                ]}
                values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
              />

              <Button
                mode="contained"
                onPress={fSubmit}
                loading={loading}
                disabled={loading}
                style={{ marginTop: 20, marginBottom: 30, paddingVertical: 8, backgroundColor: '#1e293b' }}
                icon="send"
              >
                {loading ? 'Saving...' : 'Submit Induction Data'}
              </Button>
            </View>
          )}
        </Formik>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{ backgroundColor: '#16a34a' }}
      >
        {snackbarMsg}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}