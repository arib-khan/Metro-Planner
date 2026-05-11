// screens/InductionForm.js
import React, { useState } from 'react';
import {
  View, ScrollView, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
import { Button, Text, Snackbar, IconButton } from 'react-native-paper';
import { Formik } from 'formik';
import FormSection from '../components/FormSection';
import { validationSchema } from '../utils/validationSchema';
import { useAuth } from '../utils/authHelpers';
import { useLanguage } from '../utils/i18n/LanguageContext';
import { usePermissions } from '../utils/usePermissions';
import { useCleaningTeams } from '../utils/useCleaningTeams';
import {
  saveMasterData,
  saveDailyData,
  checkCertAlerts,
  checkBrandingAlerts,
} from '../utils/trainDataService';
import {
  doc, addDoc, updateDoc, collection, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const TRAIN_IDS = Array.from({ length: 30 }, (_, i) => `KMRL-${i + 1}`);
const todayStr = () => new Date().toISOString().split('T')[0];

const API_URL = process.env.EXPO_PUBLIC_WHATSAPP_API || 'http://localhost:5000';

// ── WhatsApp sender ───────────────────────────────────────────────────────────
// Sends a message to a single phone number via the backend API.
// Returns { ok: boolean, error?: string }
const sendWhatsApp = async (phone, message, senderUid) => {
  try {
    const res = await fetch(`${API_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: senderUid,
        phone: phone.replace(/\D/g, ''),
        message,
      }),
    });
    const data = await res.json();
    return { ok: data.success, error: data.error };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// ── Build WhatsApp message for a cleaning task ────────────────────────────────
const buildCleaningMessage = ({ teamName, trainId, date, cleaningType, slotStart, slotEnd, remarks }) => {
  const dateFormatted = new Date(date).toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
  return (
    `🧹 *Cleaning Task Assigned*\n\n` +
    `Team: *${teamName}*\n` +
    `Train: *${trainId}*\n` +
    `Date: ${dateFormatted}\n` +
    `Type: ${cleaningType}\n` +
    `Slot: ${slotStart} – ${slotEnd}\n` +
    (remarks ? `Note: ${remarks}\n` : '') +
    `\nPlease confirm attendance and update status on the KMRL app after completion.\n` +
    `— KMRL Operations`
  );
};

// ── Notify entire team via WhatsApp ──────────────────────────────────────────
// Sends to the leader + all plain members. Fires and forgets — does not block
// the form submission. Results are written back to the cleaningTask doc.
const notifyTeam = async ({ team, message, senderUid, taskDocId, taskDocCollection = 'cleaningTasks' }) => {
  const recipients = [
    { name: team.leaderName, phone: team.leaderPhone, role: 'leader' },
    ...(team.members || []).map(m => ({ ...m, role: 'member' })),
  ].filter(r => r.phone?.trim());

  const results = [];
  for (const r of recipients) {
    const res = await sendWhatsApp(r.phone, message, senderUid);
    results.push({ name: r.name, phone: r.phone, role: r.role, ...res });
  }

  // Write notification log back to the correct task document (non-blocking)
  if (taskDocId) {
    try {
      await updateDoc(doc(db, taskDocCollection, taskDocId), {
        whatsappResults: results,
        whatsappSentAt: serverTimestamp(),
        whatsappSentCount: results.filter(r => r.ok).length,
      });
    } catch (_) { /* non-critical */ }
  }

  return results;
};

// ── Build Firestore payloads ──────────────────────────────────────────────────
const buildPayloads = (v, allowedSections) => {
  const date = v.entryDate || todayStr();

  const masterPayload = {
    ...(allowedSections.certificate && v.updateFitness && {
      fitness_certificates: {
        rolling_stock_validity: v.rollingStockValidity,
        signalling_validity: v.signallingValidity,
        telecom_validity: v.telecomValidity,
        status: v.fitnessStatus,
      },
    }),
    ...(allowedSections.branding && v.updateBranding && {
      branding_priorities:
        v.brandingType !== 'None'
          ? [{
            branding_type: v.brandingType,
            priority_level: parseInt(v.brandingPriorityLevel) || 2,
            exposure_minutes: parseInt(v.brandingExposureMinutes) || 0,
            valid_from: v.brandingValidFrom || date,
            valid_to: v.brandingValidTo || date,
            approved_by: v.brandingApprovedBy,
          }]
          : [],
    }),
  };

  const dailyPayload = {
    date,
    cleaning_slots: allowedSections.cleaning
      ? [{
        cleaning_type: v.cleaningType,
        slot_start: `${date}T${v.cleaningSlotStart || '23:00'}`,
        slot_end: `${date}T${v.cleaningSlotEnd || '23:45'}`,
        assigned_team: v.cleaningAssignedTeam,
        status: v.cleaningStatus,
        remarks: v.cleaningRemarks || '',
      }]
      : [],
    stabling_geometry: allowedSections.stabling
      ? {
        yard: v.yard,
        track_no: parseInt(v.trackNo) || 1,
        berth: v.berth,
        orientation: v.orientation,
        distance_from_buffer_m: parseFloat(v.distanceFromBuffer) || 4.5,
        remarks: v.stablingRemarks,
      }
      : null,
    mileage: allowedSections.mileage && v.currentMileageKm
      ? { current_mileage_km: parseInt(v.currentMileageKm) }
      : null,
    job_card_status: allowedSections.jobCard && (v.jobTask || v.jobId)
      ? [{
        job_id: v.jobId || `JC-${Math.floor(Math.random() * 9000) + 1000}`,
        task: v.jobTask,
        status: v.jobStatus,
        assigned_team: v.jobAssignedTeam,
        due_date: v.jobDueDate || date,
        priority: v.jobPriority,
      }]
      : [],
  };

  return { masterPayload, dailyPayload };
};

// ─────────────────────────────────────────────────────────────────────────────

const initialValues = {
  trainId: '',
  entryDate: todayStr(),
  // Certificate
  updateFitness: false,
  fitnessStatus: 'Fit for Service',
  rollingStockValidity: '',
  signallingValidity: '',
  telecomValidity: '',
  // Branding
  updateBranding: false,
  brandingType: 'None',
  brandingPriorityLevel: '2',
  brandingExposureMinutes: '3600',
  brandingValidFrom: '',
  brandingValidTo: '',
  brandingApprovedBy: 'Marketing Dept',
  // Cleaning — team fields are now driven by the team picker
  cleaningType: 'Daily Clean',
  cleaningSlotStart: '23:00',
  cleaningSlotEnd: '23:45',
  cleaningAssignedTeam: '',   // human-readable name — resolved to full team on submit
  cleaningStatus: 'Scheduled',
  cleaningRemarks: '',
  // Stabling
  yard: 'Muttom Depot',
  trackNo: '1',
  berth: 'A1',
  orientation: 'UP',
  distanceFromBuffer: '4.5',
  stablingRemarks: '',
  // Mileage
  currentMileageKm: '',
  // Job card
  jobId: '',
  jobTask: '',
  jobStatus: 'Open',
  jobAssignedTeam: 'Maintenance Team',
  jobDueDate: '',
  jobPriority: 'Medium',
  // Assign cleaning task (supervisor section)
  assignCleaningType: 'Daily Clean',
  assignCleaningTeam: '',
  assignCleaningSlotStart: '23:00',
  assignCleaningSlotEnd: '23:45',
  assignCleaningPriority: 'medium',
  assignCleaningDueDate: '',
  assignCleaningRemarks: '',
};

export default function InductionForm({ navigation }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { can, allowedSections, loading: permsLoading } = usePermissions();
  const { teams, teamNames, getTeamByName, loading: teamsLoading } = useCleaningTeams();

  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const fl = (key) => t(`inductionForm.fields.${key}`);
  const sec = (key) => t(`inductionForm.sections.${key}`);

  const hasAnySection =
    can('certificate') || can('branding') || can('mileage') ||
    can('cleaning') || can('stabling') || can('jobCard') || can('assignCleaningTask');

  // ── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = async (values, { resetForm }) => {
    const date = values.entryDate || todayStr();
    const meta = {
      userId: user.uid,
      userName: user.displayName || user.email,
      userEmail: user.email,
    };

    // Expiry alerts
    const alerts = [];
    if (can('certificate') && values.updateFitness) {
      alerts.push(...checkCertAlerts(
        {
          rolling_stock_validity: values.rollingStockValidity,
          signalling_validity: values.signallingValidity,
          telecom_validity: values.telecomValidity,
        },
        date, values.trainId
      ));
    }
    if (can('branding') && values.updateBranding && values.brandingType !== 'None') {
      alerts.push(...checkBrandingAlerts(
        [{ branding_type: values.brandingType, valid_to: values.brandingValidTo }],
        date, values.trainId
      ));
    }

    const expired = alerts.filter(a => a.type === 'expired');
    const warnings = alerts.filter(a => a.type === 'warning');

    // ── Core save + WhatsApp flow ─────────────────────────────────────────────
    const doSave = async () => {
      setLoading(true);
      try {
        const { masterPayload, dailyPayload } = buildPayloads(values, allowedSections);
        const saves = [];

        const hasMasterUpdate =
          (can('certificate') && values.updateFitness) ||
          (can('branding') && values.updateBranding);

        if (hasMasterUpdate) {
          saves.push(saveMasterData({ trainId: values.trainId, ...masterPayload, ...meta }));
        }
        saves.push(saveDailyData({ trainId: values.trainId, ...dailyPayload, ...meta }));

        const results = await Promise.all(saves);
        const failed = results.filter(r => !r.success);

        if (failed.length) {
          Alert.alert('Partial Error', failed.map(f => f.error).join('\n'));
          return;
        }

        // ── If cleaning section was submitted with a real team → notify them ──
        // Gate on cleaningAssignedTeam name (the value FormSection actually sets).
        // cleaningAssignedTeamId was never set because FormSection doesn't support
        // custom onChange — we resolve the team object here from the name instead.
        const selectedTeam = getTeamByName(values.cleaningAssignedTeam);
        if (
          can('cleaning') &&
          allowedSections.cleaning &&
          selectedTeam
        ) {
          // 1. Write a cleaningTask document first (so we can log WA results to it)
          const taskRef = await addDoc(collection(db, 'cleaningTasks'), {
            train_id: values.trainId,
            date,
            team_id: selectedTeam.id,
            team_name: selectedTeam.name,
            cleaning_type: values.cleaningType,
            slot_start: `${date}T${values.cleaningSlotStart}`,
            slot_end: `${date}T${values.cleaningSlotEnd}`,
            remarks: values.cleaningRemarks || '',
            status: 'Assigned',
            assignedBy: user.uid,
            assignedByName: user.displayName || user.email,
            createdAt: serverTimestamp(),
          });

          // 2. Build message and fire WhatsApp — runs in background, doesn't block
          const message = buildCleaningMessage({
            teamName: selectedTeam.name,
            trainId: values.trainId,
            date,
            cleaningType: values.cleaningType,
            slotStart: values.cleaningSlotStart,
            slotEnd: values.cleaningSlotEnd,
            remarks: values.cleaningRemarks,
          });

          // Fire-and-forget — result is written back to the task doc
          notifyTeam({
            team: selectedTeam,
            message,
            senderUid: user.uid,
            taskDocId: taskRef.id,
          }).then(waResults => {
            const sent = waResults.filter(r => r.ok).length;
            const total = waResults.length;
            console.log(`WhatsApp: ${sent}/${total} delivered for task ${taskRef.id}`);
          });
        }

        // ── If supervisor is assigning a cleaning task → write to 'tasks' ──────
        const assignedTeam = getTeamByName(values.assignCleaningTeam);
        if (can('assignCleaningTask') && allowedSections.assignCleaningTask && values.assignCleaningTeam) {
          const taskTitle = `[Cleaning] ${values.assignCleaningType} — ${values.trainId}`;
          const taskDesc =
            `Train: ${values.trainId}\n` +
            `Type: ${values.assignCleaningType}\n` +
            `Slot: ${values.assignCleaningSlotStart} – ${values.assignCleaningSlotEnd}\n` +
            (values.assignCleaningTeam ? `Team: ${values.assignCleaningTeam}\n` : '') +
            (values.assignCleaningRemarks ? `Remarks: ${values.assignCleaningRemarks}` : '');

          // Build full recipient list: leader + every member
          const allRecipients = assignedTeam ? [
            { uid: assignedTeam.leaderUid || null, email: assignedTeam.leaderEmail || null, name: assignedTeam.leaderName || assignedTeam.leaderEmail || values.assignCleaningTeam, role: 'leader' },
            ...(assignedTeam.members || []).map(m => ({ uid: m.uid || null, email: m.email || null, name: m.name || m.email || 'Member', role: 'member' })),
          ] : [];

          // Create one task doc per recipient so each person sees it in TasksScreen
          const taskDocIds = [];
          for (const recipient of allRecipients) {
            const ref = await addDoc(collection(db, 'tasks'), {
              title: taskTitle,
              description: taskDesc,
              priority: values.assignCleaningPriority,
              dueDate: values.assignCleaningDueDate || date,
              status: 'pending',
              assignedTo: recipient.uid,
              assignedToEmail: recipient.email,
              assignedToName: recipient.name,
              assignedRole: recipient.role,
              createdBy: user.uid,
              createdByName: user.displayName || user.email,
              createdAt: serverTimestamp(),
              isCleaningTask: true,
              isJobCard: false,
              sourceTrainId: values.trainId,
              cleaningType: values.assignCleaningType,
              slotStart: `${date}T${values.assignCleaningSlotStart}`,
              slotEnd: `${date}T${values.assignCleaningSlotEnd}`,
              cleaningTeam: values.assignCleaningTeam,
              cleaningDate: date,
              notifiedApp: !!recipient.uid,
              notifiedWhatsApp: false,
            });
            taskDocIds.push(ref.id);
          }

          // WhatsApp every member — fire-and-forget, results logged to first task doc
          if (assignedTeam) {
            const message = buildCleaningMessage({
              teamName: assignedTeam.name,
              trainId: values.trainId,
              date,
              cleaningType: values.assignCleaningType,
              slotStart: values.assignCleaningSlotStart,
              slotEnd: values.assignCleaningSlotEnd,
              remarks: values.assignCleaningRemarks,
            });
            notifyTeam({
              team: assignedTeam,
              message,
              senderUid: user.uid,
              taskDocId: taskDocIds[0] || null,
              taskDocCollection: 'tasks',
            }).then(waResults => {
              const sent = waResults.filter(r => r.ok).length;
              console.log(`AssignCleaningTask WhatsApp: ${sent}/${waResults.length} delivered`);
            });
          }
        }

        setSnackbarMsg(t('inductionForm.successMsg'));
        setSnackbarVisible(true);
        resetForm({ values: { ...initialValues, entryDate: date } });
        setTimeout(() => navigation.navigate('Home'), 1500);

      } catch (err) {
        Alert.alert(t('common.error'), err.message);
      } finally {
        setLoading(false);
      }
    };

    if (expired.length > 0) {
      Alert.alert(
        t('inductionForm.certAlertTitle'),
        expired.map(a => `• ${a.message}`).join('\n'),
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
        warnings.map(a => `• ${a.message}`).join('\n') + '\n\n' + t('common.ok') + '?',
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.save'), onPress: doSave },
        ]
      );
      return;
    }

    await doSave();
  };

  // ── Loading states ──────────────────────────────────────────────────────────
  if (permsLoading || teamsLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={[styles.headerSubtitle, { marginTop: 12 }]}>
          {permsLoading ? 'Loading permissions…' : 'Loading teams…'}
        </Text>
      </View>
    );
  }

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
          {({ values, errors, touched, setFieldValue, handleSubmit: fSubmit }) => {


            // Build a preview of who will be notified for the selected team
            const selectedTeam = getTeamByName(values.cleaningAssignedTeam);
            const recipientCount = selectedTeam
              ? 1 + (selectedTeam.members?.filter(m => m.phone)?.length || 0)
              : 0;

            return (
              <View style={styles.formContainer}>

                {/* ── Header ─────────────────────────────────────────────── */}
                <View style={styles.headerContainer}>
                  <IconButton icon="train" size={32} iconColor="#3b82f6" />
                  <Text variant="headlineMedium" style={styles.headerTitle}>
                    {t('inductionForm.headerTitle')}
                  </Text>
                  <Text variant="bodySmall" style={styles.headerSubtitle}>
                    {t('inductionForm.headerSubtitle')}
                  </Text>
                </View>

                {!hasAnySection && (
                  <View style={styles.noAccessCard}>
                    <IconButton icon="lock-outline" size={28} iconColor={C.textMuted} />
                    <Text style={styles.noAccessTitle}>No sections assigned</Text>
                    <Text style={styles.noAccessBody}>
                      Your account hasn't been granted access to any data sections yet.
                      Please contact your depot supervisor or admin.
                    </Text>
                  </View>
                )}

                {/* ── Train + Date ────────────────────────────────────────── */}
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

                {/* ── MASTER DATA ─────────────────────────────────────────── */}
                {(can('certificate') || can('branding')) && (
                  <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>{t('inductionForm.masterDataDivider')}</Text>
                    <View style={styles.dividerLine} />
                  </View>
                )}

                {/* Certificate — gated */}
                {can('certificate') && (
                  <FormSection
                    title={sec('fitness')}
                    fields={[
                      { name: 'updateFitness', label: fl('updateFitness'), type: 'toggle' },
                      ...(values.updateFitness ? [
                        { name: 'fitnessStatus', label: fl('fitnessStatus'), type: 'select', options: ['Fit for Service', 'Requires Check'] },
                        { name: 'rollingStockValidity', label: fl('rollingStockValidity'), type: 'text', placeholder: '2026-12-31' },
                        { name: 'signallingValidity', label: fl('signallingValidity'), type: 'text', placeholder: '2026-12-31' },
                        { name: 'telecomValidity', label: fl('telecomValidity'), type: 'text', placeholder: '2026-12-31' },
                      ] : []),
                    ]}
                    values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
                  />
                )}

                {/* Branding — gated */}
                {can('branding') && (
                  <FormSection
                    title={sec('branding')}
                    fields={[
                      { name: 'updateBranding', label: fl('updateBranding'), type: 'toggle' },
                      ...(values.updateBranding ? [
                        {
                          name: 'brandingType', label: fl('brandingType'), type: 'select',
                          options: ['None', 'Election Awareness', 'Tourism', 'Government Campaign', 'Commercial']
                        },
                        ...(values.brandingType !== 'None' ? [
                          { name: 'brandingPriorityLevel', label: fl('brandingPriorityLevel'), type: 'select', options: ['1', '2', '3'] },
                          { name: 'brandingExposureMinutes', label: fl('brandingExposureMinutes'), type: 'number', placeholder: '3600' },
                          { name: 'brandingValidFrom', label: fl('brandingValidFrom'), type: 'text', placeholder: '2026-02-01' },
                          { name: 'brandingValidTo', label: fl('brandingValidTo'), type: 'text', placeholder: '2026-02-28' },
                          { name: 'brandingApprovedBy', label: fl('brandingApprovedBy'), type: 'text' },
                        ] : []),
                      ] : []),
                    ]}
                    values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
                  />
                )}

                {/* ── DAILY DATA ──────────────────────────────────────────── */}
                {(can('cleaning') || can('stabling') || can('mileage') || can('jobCard')) && (
                  <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>{t('inductionForm.dailyDataDivider')}</Text>
                    <View style={styles.dividerLine} />
                  </View>
                )}

                {/* ── Cleaning — team picker + WhatsApp preview ───────────── */}
                {can('cleaning') && (
                  <>
                    <FormSection
                      title={sec('cleaning')}
                      fields={[
                        {
                          // Team picker — options come from Firestore via useCleaningTeams
                          name: 'cleaningAssignedTeam',
                          label: fl('cleaningAssignedTeam'),
                          type: 'select',
                          options: teamNames.length > 0 ? teamNames : ['No teams — ask admin to create one'],
                        },
                        {
                          name: 'cleaningType', label: fl('cleaningType'), type: 'select',
                          options: ['Daily Clean', 'Detailing', 'Weekly Maintenance']
                        },
                        { name: 'cleaningSlotStart', label: fl('cleaningSlotStart'), type: 'text', placeholder: '23:00' },
                        { name: 'cleaningSlotEnd', label: fl('cleaningSlotEnd'), type: 'text', placeholder: '23:45' },
                        {
                          name: 'cleaningStatus', label: fl('cleaningStatus'), type: 'select',
                          options: ['Scheduled', 'In Progress', 'Completed']
                        },
                        { name: 'cleaningRemarks', label: fl('cleaningRemarks'), type: 'textarea' },
                      ]}
                      values={values}
                      setFieldValue={setFieldValue}
                      errors={errors}
                      touched={touched}
                    />

                    {/* WhatsApp notification preview — shown when a team is selected */}
                    {selectedTeam && (
                      <View style={styles.waPreviewCard}>
                        <View style={styles.waPreviewHeader}>
                          <IconButton icon="whatsapp" size={18} iconColor="#25D366" style={styles.waIcon} />
                          <Text style={styles.waPreviewTitle}>
                            WhatsApp will notify {recipientCount} contact{recipientCount !== 1 ? 's' : ''}
                          </Text>
                        </View>

                        {/* Leader */}
                        <View style={styles.waRecipientRow}>
                          <IconButton icon="crown" size={14} iconColor="#f59e0b" style={styles.waSmallIcon} />
                          <View>
                            <Text style={styles.waRecipientName}>
                              {selectedTeam.leaderName || selectedTeam.leaderEmail}
                            </Text>
                            <Text style={styles.waRecipientSub}>
                              {selectedTeam.leaderPhone || 'No phone — will be skipped'}
                            </Text>
                          </View>
                        </View>

                        {/* Plain members */}
                        {(selectedTeam.members || []).map(m => (
                          <View key={m.id} style={styles.waRecipientRow}>
                            <IconButton icon="account" size={14} iconColor={C.textMuted} style={styles.waSmallIcon} />
                            <View>
                              <Text style={styles.waRecipientName}>{m.name}</Text>
                              <Text style={[styles.waRecipientSub, !m.phone && styles.waNoPhone]}>
                                {m.phone || 'No phone — will be skipped'}
                              </Text>
                            </View>
                          </View>
                        ))}

                        <Text style={styles.waPreviewNote}>
                          Messages are sent automatically when you submit the form.
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {/* Stabling — gated */}
                {can('stabling') && (
                  <FormSection
                    title={sec('stabling')}
                    fields={[
                      { name: 'yard', label: fl('yard'), type: 'select', options: ['Muttom Depot', 'Kalamassery Depot'] },
                      { name: 'trackNo', label: fl('trackNo'), type: 'number' },
                      { name: 'berth', label: fl('berth'), type: 'text' },
                      { name: 'orientation', label: fl('orientation'), type: 'select', options: ['UP', 'DN'] },
                      { name: 'distanceFromBuffer', label: fl('distanceFromBuffer'), type: 'number' },
                      { name: 'stablingRemarks', label: fl('stablingRemarks'), type: 'textarea' },
                    ]}
                    values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
                  />
                )}

                {/* Mileage — gated */}
                {can('mileage') && (
                  <FormSection
                    title={sec('mileage')}
                    fields={[
                      { name: 'currentMileageKm', label: fl('currentMileageKm'), type: 'number', placeholder: '288650' },
                    ]}
                    values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
                  />
                )}

                {/* Job Card — gated */}
                {can('jobCard') && (
                  <FormSection
                    title={sec('jobCard')}
                    fields={[
                      { name: 'jobId', label: fl('jobId'), type: 'text', placeholder: 'JC-4471' },
                      { name: 'jobTask', label: fl('jobTask'), type: 'textarea' },
                      { name: 'jobStatus', label: fl('jobStatus'), type: 'select', options: ['Open', 'Pending', 'Completed'] },
                      { name: 'jobPriority', label: fl('jobPriority'), type: 'select', options: ['Low', 'Medium', 'High'] },
                      { name: 'jobAssignedTeam', label: fl('jobAssignedTeam'), type: 'text' },
                      { name: 'jobDueDate', label: fl('jobDueDate'), type: 'text' },
                    ]}
                    values={values} setFieldValue={setFieldValue} errors={errors} touched={touched}
                  />
                )}

                {/* Assign Cleaning Task — supervisor only */}
                {can('assignCleaningTask') && (
                  <>
                    <FormSection
                      title={sec('assignCleaningTask')}
                      fields={[
                        {
                          name: 'assignCleaningTeam',
                          label: fl('assignCleaningTeam'),
                          type: 'select',
                          options: teamNames.length > 0 ? teamNames : ['No teams — ask admin to create one'],
                        },
                        {
                          name: 'assignCleaningType',
                          label: fl('assignCleaningType'),
                          type: 'select',
                          options: ['Daily Clean', 'Detailing', 'Weekly Maintenance', 'Deep Clean', 'Emergency Clean'],
                        },
                        {
                          name: 'assignCleaningPriority',
                          label: fl('assignCleaningPriority'),
                          type: 'select',
                          options: ['low', 'medium', 'high'],
                        },
                        { name: 'assignCleaningSlotStart', label: fl('assignCleaningSlotStart'), type: 'text', placeholder: '23:00' },
                        { name: 'assignCleaningSlotEnd', label: fl('assignCleaningSlotEnd'), type: 'text', placeholder: '23:45' },
                        { name: 'assignCleaningDueDate', label: fl('assignCleaningDueDate'), type: 'text', placeholder: todayStr() },
                        { name: 'assignCleaningRemarks', label: fl('assignCleaningRemarks'), type: 'textarea' },
                      ]}
                      values={values}
                      setFieldValue={setFieldValue}
                      errors={errors}
                      touched={touched}
                    />

                    {/* WhatsApp preview — same pattern as cleaning section */}
                    {(() => {
                      const assignedTeam = getTeamByName(values.assignCleaningTeam);
                      if (!assignedTeam) return null;
                      const recipientCount = 1 + (assignedTeam.members?.filter(m => m.phone)?.length || 0);
                      return (
                        <View style={styles.waPreviewCard}>
                          <View style={styles.waPreviewHeader}>
                            <IconButton icon="whatsapp" size={18} iconColor="#25D366" style={styles.waIcon} />
                            <Text style={styles.waPreviewTitle}>
                              WhatsApp will notify {recipientCount} contact{recipientCount !== 1 ? 's' : ''}
                            </Text>
                          </View>
                          <View style={styles.waRecipientRow}>
                            <IconButton icon="crown" size={14} iconColor="#f59e0b" style={styles.waSmallIcon} />
                            <View>
                              <Text style={styles.waRecipientName}>
                                {assignedTeam.leaderName || assignedTeam.leaderEmail}
                              </Text>
                              <Text style={styles.waRecipientSub}>
                                {assignedTeam.leaderPhone || 'No phone — will be skipped'}
                              </Text>
                            </View>
                          </View>
                          {(assignedTeam.members || []).map(m => (
                            <View key={m.id} style={styles.waRecipientRow}>
                              <IconButton icon="account" size={14} iconColor={C.textMuted} style={styles.waSmallIcon} />
                              <View>
                                <Text style={styles.waRecipientName}>{m.name}</Text>
                                <Text style={[styles.waRecipientSub, !m.phone && styles.waNoPhone]}>
                                  {m.phone || 'No phone — will be skipped'}
                                </Text>
                              </View>
                            </View>
                          ))}
                          <Text style={styles.waPreviewNote}>
                            Task created in the app + WhatsApp sent on submit.
                          </Text>
                        </View>
                      );
                    })()}
                  </>
                )}

                {/* Submit */}
                {hasAnySection && (
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
                )}

              </View>
            );
          }}
        </Formik>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={styles.snackbar}
      >
        <View style={styles.snackbarContent}>
          <IconButton icon="check-circle" size={20} iconColor="#ffffff" style={styles.snackbarIcon} />
          <Text style={styles.snackbarText}>{snackbarMsg}</Text>
        </View>
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

// ── Colours ───────────────────────────────────────────────────────────────────
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
  wa: '#25D36622',
  waBorder: '#25D36640',
};

const styles = {
  container: { flex: 1, backgroundColor: C.bg },
  centered: { justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingBottom: 100 },
  formContainer: { padding: 20 },

  headerContainer: {
    alignItems: 'center', marginBottom: 24,
    backgroundColor: C.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: C.border,
  },
  headerTitle: { color: C.text, fontSize: 22, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  headerSubtitle: { color: C.textMuted, fontSize: 12, textAlign: 'center' },

  noAccessCard: {
    alignItems: 'center', marginBottom: 24,
    backgroundColor: C.surface, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: C.border,
  },
  noAccessTitle: { color: C.textMuted, fontSize: 15, fontWeight: '600', marginTop: 4, marginBottom: 6 },
  noAccessBody: { color: C.textDim, fontSize: 12, textAlign: 'center', lineHeight: 18 },

  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginHorizontal: 12 },

  // ── WhatsApp preview card ──────────────────────────────────────────────────
  waPreviewCard: {
    marginTop: 8, marginBottom: 16,
    backgroundColor: C.wa,
    borderWidth: 1, borderColor: C.waBorder,
    borderRadius: 14, padding: 14,
  },
  waPreviewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  waIcon: { margin: 0, marginRight: 4 },
  waPreviewTitle: { color: '#25D366', fontSize: 13, fontWeight: '600' },
  waRecipientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  waSmallIcon: { margin: 0, marginRight: 6, width: 20 },
  waRecipientName: { color: C.text, fontSize: 12, fontWeight: '500' },
  waRecipientSub: { color: C.textMuted, fontSize: 11, marginTop: 1 },
  waNoPhone: { color: C.warning },
  waPreviewNote: { color: C.textDim, fontSize: 10, marginTop: 8, fontStyle: 'italic' },

  submitButton: { marginTop: 24, marginBottom: 30, backgroundColor: C.accent, borderRadius: 14 },
  submitButtonContent: { paddingVertical: 8 },
  snackbar: { backgroundColor: C.success },
  snackbarContent: { flexDirection: 'row', alignItems: 'center' },
  snackbarIcon: { margin: 0, marginRight: 8 },
  snackbarText: { color: '#000000', fontSize: 14, fontWeight: '500' },
};