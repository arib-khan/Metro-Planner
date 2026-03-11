// components/FileUploadModal.js
import React, { useState } from 'react';
import { View, Alert, Platform, StyleSheet } from 'react-native';
import { Modal, Button, Text, RadioButton, Portal, ActivityIndicator, IconButton } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../utils/authHelpers';
import { saveMasterData, saveDailyData, checkCertAlerts } from '../utils/trainDataService';

// Color palette matching HomeScreen
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

// ─────────────────────────────────────────────────────────────────────────────
// CSV line parser — handles quoted fields with commas inside
// ─────────────────────────────────────────────────────────────────────────────
const parseCSVLine = (line) => {
  const vals = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  vals.push(cur.trim());
  return vals;
};

const todayStr = () => new Date().toISOString().split('T')[0];

// ─────────────────────────────────────────────────────────────────────────────
// transformRow
//
// Maps one CSV row → { trainId, masterPayload, dailyPayload }
//
// FIX 1: branding_priorities is ALWAYS an array ([] for None trains).
//         Previously it was `undefined` for None, which caused saveMasterData
//         to skip writing the field entirely (it treats undefined as "don't touch").
//
// FIX 2: stabling fields read from exact CSV column names with no silent fallback.
//         Previously `row.depot` fallback to default hid mapping bugs.
//
// FIX 3: mileage condition uses explicit null check, not truthy check.
//         "0" is a valid mileage and must not be skipped.
// ─────────────────────────────────────────────────────────────────────────────
const transformRow = (row) => {
  // ── Identity ─────────────────────────────────────────────────────────────
  const trainId = (row.train_id || '').trim();
  if (!trainId) throw new Error('Missing train_id');

  const date = (row.date || '').trim() || todayStr();

  // ── Fitness certificates (→ trainMasterData) ──────────────────────────────
  const rsValid = (row.rolling_stock_certificate || '').trim().toLowerCase() === 'valid';
  const sigValid = (row.signalling_certificate || '').trim().toLowerCase() === 'valid';
  const telValid = (row.telecom_certificate || '').trim().toLowerCase() === 'valid';
  const expiry = (row.certificate_expiry || '').trim();

  const fitness_certificates = (rsValid || sigValid || telValid) ? {
    rolling_stock_validity: rsValid ? expiry : '',
    signalling_validity: sigValid ? expiry : '',
    telecom_validity: telValid ? expiry : '',
    status: (rsValid && sigValid && telValid) ? 'Fit for Service' : 'Requires Check',
  } : null;

  // ── Branding (→ trainMasterData) ──────────────────────────────────────────
  // ALWAYS set branding_priorities to an array — never undefined.
  // undefined means "don't overwrite existing value" in saveMasterData.
  // [] means "this train has no branding" and will correctly clear old data.
  const brandingType = (row.branding_type || '').trim();
  const hasBranding = brandingType && brandingType !== 'None';

  const branding_priorities = hasBranding ? [{
    branding_type: brandingType,
    priority_level: parseInt(row.priority_level) || 2,
    exposure_minutes: parseInt(row.exposure_minutes) || 0,
    valid_from: (row.valid_from || '').trim() || date,
    valid_to: (row.valid_to || '').trim() || date,
    approved_by: (row.approved_by || '').trim() || 'Marketing Dept',
  }] : [];                          // ← was `undefined` before — this was the branding bug

  // ── Stabling geometry (→ trainDailyData) ─────────────────────────────────
  // Read each field explicitly from its CSV column name.
  // Append " Depot" only if the value doesn't already end with "Depot".
  const depotRaw = (row.depot || row.yard || '').trim();
  const yard = depotRaw
    ? (depotRaw.endsWith('Depot') ? depotRaw : `${depotRaw} Depot`)
    : 'Muttom Depot';

  const stabling_geometry = {
    yard,
    track_no: parseInt(row.track_no) || 1,
    berth: (row.berth || '').trim() || 'A1',
    orientation: (row.orientation || '').trim() || 'UP',
    distance_from_buffer_m: parseFloat(row.distance_from_buffer_m) || 4.5,
    remarks: (row.remarks || '').trim(),
  };

  // ── Mileage (→ trainDailyData) ────────────────────────────────────────────
  // Use explicit null check — not truthy — so "0" km is not skipped.
  const rawMileage = (row.current_mileage || row.mileage || '').trim();
  const mileage = rawMileage !== ''
    ? { current_mileage_km: parseInt(rawMileage) || 0 }
    : null;

  // ── Cleaning slots (→ trainDailyData) ────────────────────────────────────
  const cleaningType = (row.cleaning_type || '').trim();
  const cleaning_slots = cleaningType ? [{
    cleaning_type: cleaningType,
    slot_start: `${date}T${(row.cleaning_start || '23:00').trim()}`,
    slot_end: `${date}T${(row.cleaning_end || '23:45').trim()}`,
    assigned_team: (row.assigned_team || '').trim() || 'Cleaning Team',
    status: 'Scheduled',
  }] : [];

  // ── Job card (→ trainDailyData) ───────────────────────────────────────────
  const jobDesc = (row.job_description || '').trim();
  const job_card_status = jobDesc ? [{
    job_id: (row.job_id || `JC-${Math.floor(Math.random() * 9000) + 1000}`).trim(),
    task: jobDesc,
    status: (row.work_order_status || 'Open').trim(),
    assigned_team: (row.assigned_team || 'Maintenance Team').trim(),
    due_date: date,
    priority: (row.priority || 'Medium').trim(),
  }] : [];

  // ── Assemble payloads ─────────────────────────────────────────────────────
  const masterPayload = {
    fitness_certificates,   // null if no cert columns filled
    branding_priorities,    // [] if no branding (never undefined)
  };

  const dailyPayload = {
    date,
    stabling_geometry,
    mileage,
    cleaning_slots,
    job_card_status,
  };

  return { trainId, masterPayload, dailyPayload };
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const FileUploadModal = ({ visible, onDismiss, onSuccess }) => {
  const { user } = useAuth();
  const [fileType, setFileType] = useState('csv');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState([]);

  const meta = user
    ? { userId: user.uid, userName: user.displayName || user.email, userEmail: user.email }
    : {};

  // ── File picker ───────────────────────────────────────────────────────────
  const pickFile = async () => {
    try {
      const types = fileType === 'csv'
        ? ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', '*/*']
        : ['text/xml', 'application/xml', '*/*'];

      const result = await DocumentPicker.getDocumentAsync({
        type: types,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const file = result.assets?.[0];
      if (!file) { Alert.alert('Error', 'No file selected.'); return; }

      Alert.alert(
        'Confirm Upload',
        `Process "${file.name}"?\n\nThis will save data for all rows to Firestore.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upload', onPress: () => { setFileName(file.name); processFile(file.uri); } },
        ]
      );
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  // ── Process file ──────────────────────────────────────────────────────────
  const processFile = async (uri) => {
    setUploading(true);
    setErrors([]);

    try {
      const res = await fetch(uri);
      if (!res.ok) throw new Error('Cannot read file — fetch failed.');
      const content = await res.text();
      if (!content.trim()) throw new Error('File is empty.');

      const { count, rowErrors } = fileType === 'csv'
        ? await processCSV(content)
        : await processXML(content);

      if (rowErrors.length > 0) {
        Alert.alert(
          `Uploaded ${count} rows`,
          `${rowErrors.length} row(s) had errors:\n${rowErrors.slice(0, 5).join('\n')}`,
        );
      } else {
        Alert.alert('✅ Success', `All ${count} trains uploaded successfully.`);
      }

      onSuccess?.();
      onDismiss();
    } catch (err) {
      Alert.alert('Upload Failed', err.message);
    } finally {
      setUploading(false);
      setProgress('');
      setFileName('');
    }
  };

  // ── CSV processor ─────────────────────────────────────────────────────────
  const processCSV = async (csv) => {
    const lines = csv
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter(l => l.trim());

    if (lines.length < 2) throw new Error('CSV needs a header row + at least one data row.');

    // Parse headers — lowercase + trim to be resilient to extra spaces
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    console.log('[CSV] Headers detected:', headers);

    let count = 0;
    const rowErrors = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      setProgress(`Row ${i} of ${lines.length - 1}…`);

      // Build row object — each header maps to the value at the same index
      const vals = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => { row[h] = (vals[idx] ?? '').trim(); });

      console.log(`[CSV] Row ${i} raw:`, row);

      try {
        const { trainId, masterPayload, dailyPayload } = transformRow(row);

        console.log(`[CSV] Row ${i} transformed:`, {
          trainId,
          date: dailyPayload.date,
          mileage: dailyPayload.mileage,
          stabling: dailyPayload.stabling_geometry,
          branding: masterPayload.branding_priorities,
          fitness: masterPayload.fitness_certificates,
        });

        // ── Expiry check (warn but don't block) ─────────────────────────────
        if (masterPayload.fitness_certificates) {
          const expiredAlerts = checkCertAlerts(
            masterPayload.fitness_certificates,
            dailyPayload.date,
            trainId
          ).filter(a => a.type === 'expired');

          if (expiredAlerts.length) {
            console.warn(`[CSV] Row ${i} expired certs:`, expiredAlerts.map(a => a.message));
            rowErrors.push(`${trainId}: ${expiredAlerts.map(a => a.message).join(', ')}`);
          }
        }

        // ── Save master data (fitness + branding) ───────────────────────────
        // Always save master if fitness OR branding data is present.
        // branding_priorities=[] is a valid value — it clears old branding.
        const hasMasterData =
          masterPayload.fitness_certificates !== null ||
          masterPayload.branding_priorities !== undefined;

        const saves = [];

        if (hasMasterData) {
          saves.push(
            saveMasterData({ trainId, ...masterPayload, ...meta })
              .then(r => { if (!r.success) throw new Error(`Master save failed: ${r.error}`); })
          );
        }

        // ── Save daily data (stabling, mileage, cleaning, jobs) ─────────────
        // Always save daily data — every CSV row represents one day's operations.
        saves.push(
          saveDailyData({ trainId, ...dailyPayload, ...meta })
            .then(r => { if (!r.success) throw new Error(`Daily save failed: ${r.error}`); })
        );

        // Run both saves — if either fails, the error is caught below per-row
        await Promise.all(saves);

        console.log(`[CSV] Row ${i} saved ✓ (${trainId} / ${dailyPayload.date})`);
        count++;

      } catch (err) {
        const msg = `Row ${i} (${row.train_id || '?'}): ${err.message}`;
        console.error('[CSV]', msg, err);
        rowErrors.push(msg);
        // Continue to next row — don't abort the whole upload on one failure
      }
    }

    return { count, rowErrors };
  };

  // ── XML processor ─────────────────────────────────────────────────────────
  const processXML = async (xml) => {
    const blocks = xml.match(/<train>[\s\S]*?<\/train>/gi) || [];
    if (!blocks.length) throw new Error('No <train> elements found in XML.');

    // All fields that may appear in a <train> block
    const fields = [
      'train_id', 'date', 'current_mileage',
      'rolling_stock_certificate', 'signalling_certificate', 'telecom_certificate', 'certificate_expiry',
      'branding_type', 'priority_level', 'exposure_minutes', 'valid_from', 'valid_to', 'approved_by',
      'cleaning_type', 'cleaning_start', 'cleaning_end', 'assigned_team',
      'depot', 'yard', 'track_no', 'berth', 'orientation', 'distance_from_buffer_m', 'remarks',
      'job_id', 'job_description', 'work_order_status', 'priority',
    ];

    let count = 0;
    const rowErrors = [];

    for (const block of blocks) {
      const row = {};
      fields.forEach(f => {
        const m = block.match(new RegExp(`<${f}>([\\s\\S]*?)<\\/${f}>`, 'i'));
        if (m) row[f] = m[1].trim();
      });

      if (!row.train_id) continue;

      try {
        const { trainId, masterPayload, dailyPayload } = transformRow(row);

        const saves = [];
        if (masterPayload.fitness_certificates !== null || masterPayload.branding_priorities !== undefined) {
          saves.push(
            saveMasterData({ trainId, ...masterPayload, ...meta })
              .then(r => { if (!r.success) throw new Error(r.error); })
          );
        }
        saves.push(
          saveDailyData({ trainId, ...dailyPayload, ...meta })
            .then(r => { if (!r.success) throw new Error(r.error); })
        );

        await Promise.all(saves);
        count++;
      } catch (err) {
        const msg = `${row.train_id}: ${err.message}`;
        console.error('[XML]', msg);
        rowErrors.push(msg);
      }
    }

    return { count, rowErrors };
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalContainer}
      >
        <View style={styles.modalHeader}>
          <View style={styles.headerLeft}>
            <IconButton icon="folder-upload" size={28} iconColor={C.accent} />
            <Text variant="titleLarge" style={styles.modalTitle}>
              Bulk Upload
            </Text>
          </View>
          <IconButton
            icon="close"
            size={20}
            iconColor={C.textMuted}
            onPress={onDismiss}
          />
        </View>

        <Text variant="bodySmall" style={styles.modalSubtitle}>
          Fitness/branding → master record (overrideable)
        </Text>
        <Text variant="bodySmall" style={[styles.modalSubtitle, { marginBottom: 16 }]}>
          Stabling / mileage / cleaning / jobs → daily record
        </Text>

        {/* File type selector */}
        <View style={styles.radioGroup}>
          <RadioButton.Group onValueChange={setFileType} value={fileType}>
            <View style={styles.radioItem}>
              <RadioButton value="csv" color={C.accent} />
              <Text style={styles.radioLabel}>CSV (.csv)</Text>
            </View>
            <View style={styles.radioItem}>
              <RadioButton value="xml" color={C.accent} />
              <Text style={styles.radioLabel}>XML (.xml)</Text>
            </View>
          </RadioButton.Group>
        </View>

        {/* Selected file name */}
        {fileName ? (
          <View style={styles.fileNameContainer}>
            <IconButton icon="check-circle" size={18} iconColor={C.success} />
            <Text variant="bodyMedium" style={styles.fileName}>
              {fileName}
            </Text>
          </View>
        ) : null}

        {/* Progress / spinner */}
        {uploading ? (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.progressText}>{progress}</Text>
          </View>
        ) : (
          <Button
            mode="contained"
            onPress={pickFile}
            style={styles.selectButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            icon="file-upload"
          >
            {Platform.OS === 'ios' ? 'Choose File' : 'Select File'}
          </Button>
        )}

        <Button
          mode="outlined"
          onPress={onDismiss}
          disabled={uploading}
          style={styles.cancelButton}
          labelStyle={styles.cancelButtonLabel}
        >
          {uploading ? 'Uploading...' : 'Cancel'}
        </Button>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: C.surface,
    padding: 20,
    margin: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  modalSubtitle: {
    color: C.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  radioGroup: {
    backgroundColor: C.surface2,
    borderRadius: 12,
    padding: 12,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  radioLabel: {
    color: C.text,
    fontSize: 14,
    marginLeft: 8,
  },
  fileNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
    padding: 8,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.success,
  },
  fileName: {
    color: C.success,
    fontSize: 14,
    fontWeight: '500',
  },
  uploadingContainer: {
    alignItems: 'center',
    marginVertical: 20,
    backgroundColor: C.surface2,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  progressText: {
    marginTop: 10,
    color: C.textMuted,
    fontSize: 13,
  },
  selectButton: {
    marginBottom: 10,
    backgroundColor: C.accent,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  cancelButton: {
    borderRadius: 12,
    borderColor: C.border,
  },
  cancelButtonLabel: {
    color: C.textMuted,
  },
});

export default FileUploadModal;