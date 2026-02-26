//components\FileUploadModal.js
import React, { useState } from 'react';
import { View, Alert, Platform } from 'react-native';
import { Modal, Button, Text, RadioButton, Portal, ActivityIndicator } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../utils/authHelpers';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// ── New JSON format transformer (CSV row → Firestore document) ────────────────
const transformCSVRowToNewFormat = (rowData, user, fileName) => {
  const currentDate = new Date().toISOString().split('T')[0];
  const trainId =
    rowData.train_id ||
    rowData.trainid ||
    `KMRL-${Math.floor(Math.random() * 30) + 1}`;

  const brandingType = rowData.branding_type || rowData.branding || 'None';
  const isBranded = brandingType && brandingType !== 'None';

  // Fitness — derive from certificate columns
  const rsValid = (rowData.rolling_stock_certificate || rowData.rolling_stock || '').toLowerCase() === 'valid';
  const sigValid = (rowData.signalling_certificate || rowData.signalling || '').toLowerCase() === 'valid';
  const telValid = (rowData.telecom_certificate || rowData.telecom || '').toLowerCase() === 'valid';
  const expiryDate = rowData.certificate_expiry || rowData.expiry || currentDate;

  return {
    date: currentDate,

    branding_priorities: isBranded ? [{
      train_id: trainId,
      exposure_minutes: parseInt(rowData.remaining_exposure_hours) * 60 ||
        parseInt(rowData.exposure_minutes) || 0,
      priority_level:
        parseInt(rowData.priority_level || rowData.priority) ||
        (brandingType === 'Government Campaign' || brandingType === 'Election Awareness' ? 1 : 2),
      branding_type: brandingType,
      valid_from: rowData.valid_from || rowData.branding_valid_from || currentDate,
      valid_to: rowData.valid_to || rowData.branding_valid_to || currentDate,
      approved_by: rowData.approved_by || 'Marketing Dept',
    }] : [],

    cleaning_slots:
      (rowData.cleaning_type || rowData.cleaning) &&
        (rowData.cleaning_type || rowData.cleaning) !== 'None'
        ? [{
          train_id: trainId,
          cleaning_type: rowData.cleaning_type || rowData.cleaning,
          slot_start: `${currentDate}T${rowData.cleaning_time || '23:00'}`,
          slot_end: `${currentDate}T${rowData.cleaning_end_time || '23:45'}`,
          assigned_team: rowData.assigned_team || rowData.team || 'Cleaning Team',
          status: 'Scheduled',
        }]
        : [],

    stabling_geometry: [{
      train_id: trainId,
      yard: (rowData.depot || rowData.yard)
        ? `${rowData.depot || rowData.yard} Depot`
        : 'Muttom Depot',
      track_no: parseInt(rowData.track_no || rowData.track) || 1,
      berth: rowData.berth || 'A1',
      orientation: rowData.orientation || 'UP',
      distance_from_buffer_m: parseFloat(rowData.distance_from_buffer_m) || 4.5,
      remarks: rowData.stabling_remarks || rowData.remarks || 'Normal parking',
    }],

    fitness_certificates: [{
      train_id: trainId,
      // Store the actual expiry dates — dashboard shows these for any date within validity
      rolling_stock_validity: rsValid ? expiryDate : '',
      signalling_validity: sigValid ? expiryDate : '',
      telecom_validity: telValid ? expiryDate : '',
      status: rsValid && sigValid && telValid ? 'Fit for Service' : 'Requires Check',
    }],

    job_card_status:
      rowData.job_description || rowData.description
        ? [{
          train_id: trainId,
          job_id:
            rowData.job_card_number ||
            rowData.job_id ||
            `JC-${Math.floor(Math.random() * 9000) + 1000}`,
          task: rowData.job_description || rowData.description,
          status: rowData.work_order_status || rowData.status || 'Open',
          assigned_team: rowData.assigned_team || rowData.team || 'Maintenance Team',
          due_date: currentDate,
          priority: rowData.priority || 'Medium',
        }]
        : [],

    // New mileage format — only current_mileage_km
    mileage: [{
      train_id: trainId,
      current_mileage_km: parseInt(rowData.current_mileage || rowData.mileage || rowData.mileage_km) || 0,
    }],

    // Metadata
    userId: user.uid,
    userName: user.displayName,
    userEmail: user.email,
    timestamp: serverTimestamp(),
    status: 'submitted',
    syncStatus: 'synced',
    source: 'bulk_upload',
    original_file: fileName,
  };
};

// ── CSV line parser (handles quoted fields with commas) ───────────────────────
const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
};

// ── CSV template generator ────────────────────────────────────────────────────
export const generateCSVTemplate = () => {
  const headers = [
    'train_id', 'rolling_stock_certificate', 'signalling_certificate', 'telecom_certificate',
    'certificate_expiry', 'current_mileage', 'branding_type', 'exposure_minutes', 'priority_level',
    'valid_from', 'valid_to', 'cleaning_type', 'assigned_team', 'depot', 'track_no', 'berth',
    'job_description', 'work_order_status', 'priority',
  ];
  const sample = [
    'KMRL-1', 'Valid', 'Valid', 'Valid', '2025-12-31', '288650',
    'Election Awareness', '3600', '1', '2025-11-01', '2025-11-30',
    'Daily Clean', 'Team A', 'Muttom', '7', 'B2',
    'Brake Inspection', 'Open', 'High',
  ];
  return headers.join(',') + '\n' + sample.join(',');
};

// ── Component ─────────────────────────────────────────────────────────────────
const FileUploadModal = ({ visible, onDismiss, onSuccess }) => {
  const { user } = useAuth();
  const [fileType, setFileType] = useState('csv');
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState('');

  const pickFile = async () => {
    try {
      const mimeTypes =
        fileType === 'csv'
          ? ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel']
          : ['text/xml', 'application/xml'];

      const result = await DocumentPicker.getDocumentAsync({
        type: mimeTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        Alert.alert('Confirm File', `Process "${file.name}"?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Process',
            onPress: () => {
              setFileName(file.name);
              processFile(file.uri, file.name);
            },
          },
        ]);
      }
    } catch (error) {
      Alert.alert('File Selection Error', error.message);
    }
  };

  const processFile = async (fileUri, name) => {
    setUploading(true);
    setProgress('Reading file...');
    try {
      const response = await fetch(fileUri);
      if (!response.ok) throw new Error('Cannot access selected file.');
      const content = await response.text();
      if (!content.trim()) throw new Error('File is empty.');

      let count = 0;
      if (fileType === 'csv') {
        count = await processCSV(content, name);
      } else {
        count = await processXML(content, name);
      }

      Alert.alert('Success', `Uploaded ${count} record(s) to database!`);
      onSuccess();
      onDismiss();
    } catch (error) {
      Alert.alert('Processing Error', error.message || 'Failed to process file.');
    } finally {
      setUploading(false);
      setProgress('');
      setFileName('');
    }
  };

  const processCSV = async (csvContent, fileName) => {
    const lines = csvContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter(l => l.trim() !== '');

    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      setProgress(`Processing row ${i} of ${lines.length - 1}...`);

      const values = parseCSVLine(lines[i]);
      const rowData = {};
      headers.forEach((h, idx) => (rowData[h] = values[idx] || ''));

      try {
        const docData = transformCSVRowToNewFormat(rowData, user, fileName);
        await addDoc(collection(db, 'trainInduction'), docData);
        count++;
      } catch (err) {
        console.error(`Row ${i} error:`, err);
      }
    }

    return count;
  };

  const processXML = async (xmlContent, fileName) => {
    const trainMatches = xmlContent.match(/<train>[\s\S]*?<\/train>/gi) || [];
    if (trainMatches.length === 0) throw new Error('No <train> elements found in XML.');

    const fields = [
      'train_id', 'current_mileage', 'branding_type', 'valid_from', 'valid_to',
      'cleaning_type', 'depot', 'certificate_expiry',
      'rolling_stock_certificate', 'signalling_certificate', 'telecom_certificate',
    ];

    let count = 0;
    for (const block of trainMatches) {
      const rowData = {};
      fields.forEach(field => {
        const m = block.match(new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`, 'i'));
        if (m) rowData[field] = m[1].trim();
      });
      if (!rowData.train_id) continue;

      try {
        const docData = transformCSVRowToNewFormat(rowData, user, fileName);
        await addDoc(collection(db, 'trainInduction'), docData);
        count++;
      } catch (err) {
        console.error('XML row error:', err);
      }
    }
    return count;
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          backgroundColor: 'white',
          padding: 20,
          margin: 20,
          borderRadius: 12,
        }}
      >
        <Text variant="titleLarge" style={{ marginBottom: 4, textAlign: 'center', fontWeight: 'bold' }}>
          📁 Bulk Upload
        </Text>
        <Text variant="bodySmall" style={{ marginBottom: 20, textAlign: 'center', color: 'gray' }}>
          Upload CSV or XML with multiple train records (new format)
        </Text>

        <RadioButton.Group onValueChange={setFileType} value={fileType}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <RadioButton value="csv" />
            <Text>CSV File (.csv)</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <RadioButton value="xml" />
            <Text>XML File (.xml)</Text>
          </View>
        </RadioButton.Group>

        {fileName ? (
          <Text variant="bodyMedium" style={{ marginBottom: 12, textAlign: 'center', color: 'green' }}>
            ✅ {fileName}
          </Text>
        ) : null}

        {uploading ? (
          <View style={{ alignItems: 'center', marginVertical: 20 }}>
            <ActivityIndicator size="large" color="#1e293b" />
            <Text style={{ marginTop: 10, color: '#666' }}>{progress || 'Uploading...'}</Text>
          </View>
        ) : (
          <>
            <Button
              mode="contained"
              onPress={pickFile}
              style={{ marginBottom: 10, backgroundColor: '#1e293b' }}
              icon="file-upload"
            >
              {Platform.OS === 'ios' ? 'Choose File' : 'Select File'}
            </Button>
            <Text variant="bodySmall" style={{ textAlign: 'center', color: 'gray', marginBottom: 10 }}>
              CSV columns: train_id, current_mileage, branding_type, valid_from, valid_to,{'\n'}
              exposure_minutes, certificate_expiry, rolling_stock_certificate, …
            </Text>
          </>
        )}

        <Button mode="outlined" onPress={onDismiss} disabled={uploading}>
          {uploading ? 'Processing...' : 'Cancel'}
        </Button>
      </Modal>
    </Portal>
  );
};

export default FileUploadModal;