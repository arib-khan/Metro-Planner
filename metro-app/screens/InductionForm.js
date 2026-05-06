// screens/InductionForm.js
import React, { useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Button, Text, Snackbar, IconButton } from 'react-native-paper';
import { Formik } from 'formik';
import FormSection from '../components/FormSection';
import { validationSchema } from '../utils/validationSchema';
import { useAuth } from '../utils/authHelpers';
import { useLanguage } from '../utils/i18n/LanguageContext';
import {
  saveMasterData,
  saveDailyData,
  checkCertAlerts,
  checkBrandingAlerts,
} from '../utils/trainDataService';

export const TRAIN_IDS = Array.from({ length: 30 }, (_, i) => `KMRL-${i + 1}`);
const todayStr = () => new Date().toISOString().split('T')[0];

const initialValues = {
  trainId: '',
  entryDate: todayStr(),
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

const buildPayloads = (v) => {
  const date = v.entryDate || todayStr();

  // ✅ Fix #4 & #5: Use conditional spreading so keys are completely omitted
  // when not updating — prevents undefined from overwriting existing Firestore data.
  const masterPayload = {
    ...(v.updateFitness && {
      fitness_certificates: {
        rolling_stock_validity: v.rollingStockValidity,
        signalling_validity: v.signallingValidity,
        telecom_validity: v.telecomValidity,
        status: v.fitnessStatus,
      },
    }),
    ...(v.updateBranding && {
      branding_priorities:
        v.brandingType !== 'None'
          ? [
            {
              branding_type: v.brandingType,
              priority_level: parseInt(v.brandingPriorityLevel) || 2,
              exposure_minutes: parseInt(v.brandingExposureMinutes) || 0,
              valid_from: v.brandingValidFrom || date,
              valid_to: v.brandingValidTo || date,
              approved_by: v.brandingApprovedBy,
            },
          ]
          : [], // Explicitly clear branding if type is set to None
    }),
  };

  const dailyPayload = {
    date,
    cleaning_slots: [
      {
        cleaning_type: v.cleaningType,
        slot_start: `${date}T${v.cleaningSlotStart || '23:00'}`,
        slot_end: `${date}T${v.cleaningSlotEnd || '23:45'}`,
        assigned_team: v.cleaningAssignedTeam,
        status: v.cleaningStatus,
      },
    ],
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
    job_card_status:
      v.jobTask || v.jobId
        ? [
          {
            job_id: v.jobId || `JC-${Math.floor(Math.random() * 9000) + 1000}`,
            task: v.jobTask,
            status: v.jobStatus,
            assigned_team: v.jobAssignedTeam,
            due_date: v.jobDueDate || date,
            priority: v.jobPriority,
          },
        ]
        : [],
  };

  return { masterPayload, dailyPayload };
};

export default function InductionForm({ navigation }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Shorthand so field label calls are concise
  const fl = (key) => t(`inductionForm.fields.${key}`);
  const sec = (key) => t(`inductionForm.sections.${key}`);

  const handleSubmit = async (values, { resetForm }) => {
    const date = values.entryDate || todayStr();
    const meta = {
      userId: user.uid,
      userName: user.displayName || user.email,
      userEmail: user.email,
    };

    const alerts = [];
    if (values.updateFitness) {
      alerts.push(
        ...checkCertAlerts(
          {
            rolling_stock_validity: values.rollingStockValidity,
            signalling_validity: values.signallingValidity,
            telecom_validity: values.telecomValidity,
          },
          date,
          values.trainId
        )
      );
    }
    if (values.updateBranding && values.brandingType !== 'None') {
      alerts.push(
        ...checkBrandingAlerts(
          [{ branding_type: values.brandingType, valid_to: values.brandingValidTo }],
          date,
          values.trainId
        )
      );
    }

    const expired = alerts.filter((a) => a.type === 'expired');
    const warnings = alerts.filter((a) => a.type === 'warning');

    const doSave = async () => {
      setLoading(true);
      try {
        const { masterPayload, dailyPayload } = buildPayloads(values);
        const saves = [];

        // ✅ Fix #5: Only save master if there's actually something to update
        // masterPayload keys are only present when their toggle is on,
        // so Object.keys check correctly guards against empty saves.
        if (values.updateFitness || values.updateBranding) {
          saves.push(
            saveMasterData({ trainId: values.trainId, ...masterPayload, ...meta })
          );
        }
        saves.push(saveDailyData({ trainId: values.trainId, ...dailyPayload, ...meta }));

        const results = await Promise.all(saves);
        const failed = results.filter((r) => !r.success);

        if (failed.length) {
          Alert.alert('Partial Error', failed.map((f) => f.error).join('\n'));
        } else {
          setSnackbarMsg(t('inductionForm.successMsg'));
          setSnackbarVisible(true);
          resetForm({ values: { ...initialValues, entryDate: date } });
          setTimeout(() => navigation.navigate('Home'), 1500);
        }
      } catch (err) {
        Alert.alert(t('common.error'), err.message);
      } finally {
        setLoading(false);
      }
    };

    if (expired.length > 0) {
      Alert.alert(
        t('inductionForm.certAlertTitle'),
        expired.map((a) => `• ${a.message}`).join('\n'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.submit'), style: 'destructive', onPress: doSave },
        ]
      );
      return;
    }
    if (warnings.length > 0) {
      Alert.alert(
        t('inductionForm.certAlertTitle'),
        warnings.map((a) => `• ${a.message}`).join('\n') + '\n\n' + t('common.ok') + '?',
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.save'), onPress: doSave },
        ]
      );
      return;
    }
    await doSave();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched, setFieldValue, handleSubmit: fSubmit }) => (
            <View style={styles.formContainer}>

              {/* Header */}
              <View style={styles.headerContainer}>
                <IconButton icon="train" size={32} iconColor="#3b82f6" />
                <Text variant="headlineMedium" style={styles.headerTitle}>
                  {t('inductionForm.headerTitle')}
                </Text>
                <Text variant="bodySmall" style={styles.headerSubtitle}>
                  {t('inductionForm.headerSubtitle')}
                </Text>
              </View>

              {/* Train + Date */}
              <FormSection
                title={sec('identification')}
                fields={[
                  { name: 'trainId', label: fl('trainId'), type: 'select', options: TRAIN_IDS },
                  { name: 'entryDate', label: fl('entryDate'), type: 'text', placeholder: todayStr() },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Master data divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('inductionForm.masterDataDivider')}</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Fitness */}
              <FormSection
                title={sec('fitness')}
                fields={[
                  { name: 'updateFitness', label: fl('updateFitness'), type: 'toggle' },
                  ...(values.updateFitness
                    ? [
                      {
                        name: 'fitnessStatus',
                        label: fl('fitnessStatus'),
                        type: 'select',
                        options: ['Fit for Service', 'Requires Check'],
                      },
                      {
                        name: 'rollingStockValidity',
                        label: fl('rollingStockValidity'),
                        type: 'text',
                        placeholder: '2026-12-31',
                      },
                      {
                        name: 'signallingValidity',
                        label: fl('signallingValidity'),
                        type: 'text',
                        placeholder: '2026-12-31',
                      },
                      {
                        name: 'telecomValidity',
                        label: fl('telecomValidity'),
                        type: 'text',
                        placeholder: '2026-12-31',
                      },
                    ]
                    : []),
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Branding */}
              <FormSection
                title={sec('branding')}
                fields={[
                  { name: 'updateBranding', label: fl('updateBranding'), type: 'toggle' },
                  ...(values.updateBranding
                    ? [
                      {
                        name: 'brandingType',
                        label: fl('brandingType'),
                        type: 'select',
                        options: [
                          'None',
                          'Election Awareness',
                          'Tourism',
                          'Government Campaign',
                          'Commercial',
                        ],
                      },
                      ...(values.brandingType !== 'None'
                        ? [
                          {
                            name: 'brandingPriorityLevel',
                            label: fl('brandingPriorityLevel'),
                            type: 'select',
                            options: ['1', '2', '3'],
                          },
                          {
                            name: 'brandingExposureMinutes',
                            label: fl('brandingExposureMinutes'),
                            type: 'number',
                            placeholder: '3600',
                          },
                          {
                            name: 'brandingValidFrom',
                            label: fl('brandingValidFrom'),
                            type: 'text',
                            placeholder: '2026-02-01',
                          },
                          {
                            name: 'brandingValidTo',
                            label: fl('brandingValidTo'),
                            type: 'text',
                            placeholder: '2026-02-28',
                          },
                          {
                            name: 'brandingApprovedBy',
                            label: fl('brandingApprovedBy'),
                            type: 'text',
                          },
                        ]
                        : []),
                    ]
                    : []),
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Daily data divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('inductionForm.dailyDataDivider')}</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Cleaning */}
              <FormSection
                title={sec('cleaning')}
                fields={[
                  {
                    name: 'cleaningType',
                    label: fl('cleaningType'),
                    type: 'select',
                    options: ['Daily Clean', 'Detailing', 'Weekly Maintenance'],
                  },
                  {
                    name: 'cleaningSlotStart',
                    label: fl('cleaningSlotStart'),
                    type: 'text',
                    placeholder: '23:00',
                  },
                  {
                    name: 'cleaningSlotEnd',
                    label: fl('cleaningSlotEnd'),
                    type: 'text',
                    placeholder: '23:45',
                  },
                  { name: 'cleaningAssignedTeam', label: fl('cleaningAssignedTeam'), type: 'text' },
                  {
                    name: 'cleaningStatus',
                    label: fl('cleaningStatus'),
                    type: 'select',
                    options: ['Scheduled', 'In Progress', 'Completed'],
                  },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Stabling */}
              <FormSection
                title={sec('stabling')}
                fields={[
                  {
                    name: 'yard',
                    label: fl('yard'),
                    type: 'select',
                    options: ['Muttom Depot', 'Kalamassery Depot'],
                  },
                  { name: 'trackNo', label: fl('trackNo'), type: 'number' },
                  { name: 'berth', label: fl('berth'), type: 'text' },
                  {
                    name: 'orientation',
                    label: fl('orientation'),
                    type: 'select',
                    options: ['UP', 'DN'],
                  },
                  { name: 'distanceFromBuffer', label: fl('distanceFromBuffer'), type: 'number' },
                  { name: 'stablingRemarks', label: fl('stablingRemarks'), type: 'textarea' },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Mileage */}
              <FormSection
                title={sec('mileage')}
                fields={[
                  {
                    name: 'currentMileageKm',
                    label: fl('currentMileageKm'),
                    type: 'number',
                    placeholder: '288650',
                  },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              {/* Job Card */}
              <FormSection
                title={sec('jobCard')}
                fields={[
                  { name: 'jobId', label: fl('jobId'), type: 'text', placeholder: 'JC-4471' },
                  { name: 'jobTask', label: fl('jobTask'), type: 'textarea' },
                  {
                    name: 'jobStatus',
                    label: fl('jobStatus'),
                    type: 'select',
                    options: ['Open', 'Pending', 'Completed'],
                  },
                  {
                    name: 'jobPriority',
                    label: fl('jobPriority'),
                    type: 'select',
                    options: ['Low', 'Medium', 'High'],
                  },
                  { name: 'jobAssignedTeam', label: fl('jobAssignedTeam'), type: 'text' },
                  { name: 'jobDueDate', label: fl('jobDueDate'), type: 'text' },
                ]}
                values={values}
                setFieldValue={setFieldValue}
                errors={errors}
                touched={touched}
              />

              <Button
                mode="contained"
                onPress={fSubmit}
                loading={loading}
                disabled={loading}
                style={styles.submitButton}
                contentStyle={styles.submitButtonContent}
                icon="send"
              >
                {loading ? t('inductionForm.submittingBtn') : t('inductionForm.submitBtn')}
              </Button>
            </View>
          )}
        </Formik>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={styles.snackbar}
      >
        <View style={styles.snackbarContent}>
          <IconButton
            icon="check-circle"
            size={20}
            iconColor="#ffffff"
            style={styles.snackbarIcon}
          />
          <Text style={styles.snackbarText}>{snackbarMsg}</Text>
        </View>
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const C = {
  bg: '#0a0f1e',
  surface: '#111827',
  surface2: '#1a2235',
  border: '#1e2d45',
  accent: '#3b82f6',
  accentGlow: '#3b82f622',
  text: '#f0f4ff',
  textMuted: '#6b7fa3',
  textDim: '#3d506b',
  success: '#00e876',
  warning: '#f59e0b',
  error: '#ef4444',
};

const styles = {
  container: { flex: 1, backgroundColor: C.bg },
  scrollView: { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingBottom: 100 },
  formContainer: { padding: 20 },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  headerTitle: { color: C.text, fontSize: 22, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  headerSubtitle: { color: C.textMuted, fontSize: 12, textAlign: 'center' },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginHorizontal: 12,
  },
  submitButton: { marginTop: 24, marginBottom: 30, backgroundColor: C.accent, borderRadius: 14 },
  submitButtonContent: { paddingVertical: 8 },
  snackbar: { backgroundColor: C.success },
  snackbarContent: { flexDirection: 'row', alignItems: 'center' },
  snackbarIcon: { margin: 0, marginRight: 8 },
  snackbarText: { color: '#000000', fontSize: 14, fontWeight: '500' },
};