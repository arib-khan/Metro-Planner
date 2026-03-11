// components/FormSection.js
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Card,
  Text,
  TextInput,
  HelperText,
  Switch,
  Menu,
  Button,
  Portal,
  Modal,
  IconButton,
} from 'react-native-paper';

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

const FormSection = ({ title, fields, values, setFieldValue, errors, touched }) => {
  const [expanded, setExpanded] = useState(true);
  const [menuVisible, setMenuVisible] = useState({});
  const [dateModalVisible, setDateModalVisible] = useState({});
  const [timeModalVisible, setTimeModalVisible] = useState({});

  const showDatePicker = (fieldName) => {
    setDateModalVisible({ ...dateModalVisible, [fieldName]: true });
  };

  const hideDatePicker = (fieldName) => {
    setDateModalVisible({ ...dateModalVisible, [fieldName]: false });
  };

  const showTimePicker = (fieldName) => {
    setTimeModalVisible({ ...timeModalVisible, [fieldName]: true });
  };

  const hideTimePicker = (fieldName) => {
    setTimeModalVisible({ ...timeModalVisible, [fieldName]: false });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const renderField = (field) => {
    const { name, label, type, options, multiline, editable = true, placeholder } = field;
    const value = values[name];
    const error = touched[name] && errors[name];

    switch (type) {
      case 'text':
      case 'number':
      case 'textarea':
        return (
          <View key={name} style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
              mode="outlined"
              value={value}
              onChangeText={(text) => setFieldValue(name, text)}
              keyboardType={type === 'number' ? 'numeric' : 'default'}
              multiline={type === 'textarea'}
              numberOfLines={type === 'textarea' ? 3 : 1}
              error={error}
              editable={editable}
              placeholder={placeholder}
              placeholderTextColor={C.textDim}
              style={styles.textInput}
              outlineColor={C.border}
              activeOutlineColor={C.accent}
              textColor={C.text}
              theme={{
                colors: {
                  background: C.surface2,
                  onSurfaceVariant: C.textMuted,
                }
              }}
            />
            {error && <HelperText type="error" style={styles.errorText}>{error}</HelperText>}
          </View>
        );

      case 'select':
        return (
          <View key={name} style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Menu
              visible={menuVisible[name] || false}
              onDismiss={() => setMenuVisible({ ...menuVisible, [name]: false })}
              anchor={
                <Button
                  mode="outlined"
                  onPress={() => setMenuVisible({ ...menuVisible, [name]: true })}
                  style={styles.selectButton}
                  contentStyle={styles.selectButtonContent}
                  textColor={value ? C.text : C.textMuted}
                  icon="chevron-down"
                >
                  {value || `Select ${label}`}
                </Button>
              }
              style={styles.menu}
            >
              <View style={styles.menuContent}>
                {options.map((option) => (
                  <Menu.Item
                    key={option}
                    onPress={() => {
                      setFieldValue(name, option);
                      setMenuVisible({ ...menuVisible, [name]: false });
                    }}
                    title={option}
                    titleStyle={styles.menuItemTitle}
                    style={value === option ? styles.menuItemSelected : null}
                  />
                ))}
              </View>
            </Menu>
            {error && <HelperText type="error" style={styles.errorText}>{error}</HelperText>}
          </View>
        );

      case 'toggle':
        return (
          <View key={name} style={styles.toggleContainer}>
            <Text style={styles.toggleLabel}>{label}</Text>
            <Switch
              value={value}
              onValueChange={(newValue) => setFieldValue(name, newValue)}
              color={C.accent}
            />
          </View>
        );

      case 'date':
        return (
          <View key={name} style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Button
              mode="outlined"
              onPress={() => showDatePicker(name)}
              style={styles.dateButton}
              contentStyle={styles.dateButtonContent}
              textColor={value ? C.text : C.textMuted}
              icon="calendar"
            >
              {value ? formatDate(value) : `Select ${label}`}
            </Button>

            <Portal>
              <Modal
                visible={dateModalVisible[name] || false}
                onDismiss={() => hideDatePicker(name)}
                contentContainerStyle={styles.modalContent}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select {label}</Text>
                  <IconButton
                    icon="close"
                    size={20}
                    iconColor={C.textMuted}
                    onPress={() => hideDatePicker(name)}
                  />
                </View>

                <TextInput
                  mode="outlined"
                  label="Date (YYYY-MM-DD)"
                  value={value ? new Date(value).toISOString().split('T')[0] : ''}
                  onChangeText={(text) => {
                    if (text.match(/^\d{4}-\d{2}-\d{2}$/)) {
                      setFieldValue(name, new Date(text).toISOString());
                    }
                  }}
                  placeholder="2024-01-20"
                  style={styles.modalInput}
                  outlineColor={C.border}
                  activeOutlineColor={C.accent}
                  textColor={C.text}
                  theme={{
                    colors: {
                      background: C.surface2,
                      onSurfaceVariant: C.textMuted,
                    }
                  }}
                />

                <View style={styles.modalActions}>
                  <Button
                    onPress={() => hideDatePicker(name)}
                    textColor={C.textMuted}
                  >
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={() => {
                      setFieldValue(name, new Date().toISOString());
                      hideDatePicker(name);
                    }}
                    buttonColor={C.accent}
                    textColor="#ffffff"
                  >
                    Use Today
                  </Button>
                </View>
              </Modal>
            </Portal>

            {error && <HelperText type="error" style={styles.errorText}>{error}</HelperText>}
          </View>
        );

      case 'time':
        return (
          <View key={name} style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Button
              mode="outlined"
              onPress={() => showTimePicker(name)}
              style={styles.dateButton}
              contentStyle={styles.dateButtonContent}
              textColor={value ? C.text : C.textMuted}
              icon="clock-outline"
            >
              {value || `Select ${label}`}
            </Button>

            <Portal>
              <Modal
                visible={timeModalVisible[name] || false}
                onDismiss={() => hideTimePicker(name)}
                contentContainerStyle={styles.modalContent}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select {label}</Text>
                  <IconButton
                    icon="close"
                    size={20}
                    iconColor={C.textMuted}
                    onPress={() => hideTimePicker(name)}
                  />
                </View>

                <TextInput
                  mode="outlined"
                  label="Time (HH:MM)"
                  value={value}
                  onChangeText={(text) => setFieldValue(name, text)}
                  placeholder="14:30"
                  style={styles.modalInput}
                  outlineColor={C.border}
                  activeOutlineColor={C.accent}
                  textColor={C.text}
                  theme={{
                    colors: {
                      background: C.surface2,
                      onSurfaceVariant: C.textMuted,
                    }
                  }}
                />

                <View style={styles.modalActions}>
                  <Button
                    onPress={() => hideTimePicker(name)}
                    textColor={C.textMuted}
                  >
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={() => {
                      const now = new Date();
                      const timeString = now.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      });
                      setFieldValue(name, timeString);
                      hideTimePicker(name);
                    }}
                    buttonColor={C.accent}
                    textColor="#ffffff"
                  >
                    Use Now
                  </Button>
                </View>
              </Modal>
            </Portal>

            {error && <HelperText type="error" style={styles.errorText}>{error}</HelperText>}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Card style={styles.card}>
      <Card.Title
        title={title}
        titleStyle={styles.cardTitle}
        right={(props) => (
          <IconButton
            {...props}
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            iconColor={C.textMuted}
            onPress={() => setExpanded(!expanded)}
          />
        )}
      />
      {expanded && (
        <Card.Content style={styles.cardContent}>
          {fields.map(renderField)}
        </Card.Content>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  cardContent: {
    paddingTop: 0,
    paddingBottom: 16,
  },
  fieldContainer: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  textInput: {
    backgroundColor: C.surface2,
    fontSize: 14,
  },
  selectButton: {
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: C.surface2,
  },
  selectButtonContent: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  menu: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  menuContent: {
    backgroundColor: C.surface2,
  },
  menuItemTitle: {
    color: C.text,
  },
  menuItemSelected: {
    backgroundColor: C.accentGlow,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: C.surface2,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  toggleLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '500',
  },
  dateButton: {
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: C.surface2,
  },
  dateButtonContent: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  modalContent: {
    backgroundColor: C.surface,
    padding: 20,
    margin: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: C.surface2,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  errorText: {
    color: C.error,
    fontSize: 11,
    marginTop: 4,
    marginLeft: 12,
  },
});

export default FormSection;