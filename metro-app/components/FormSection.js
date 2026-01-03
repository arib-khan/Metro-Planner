//components\FormSection.js
import React, { useState } from 'react';
import { View, Platform } from 'react-native';
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
  RadioButton,
} from 'react-native-paper';

const FormSection = ({ title, fields, values, setFieldValue, errors, touched }) => {
  const [expanded, setExpanded] = useState(true);
  const [menuVisible, setMenuVisible] = useState({});
  const [dateModalVisible, setDateModalVisible] = useState({});
  const [timeModalVisible, setTimeModalVisible] = useState({});
  const [tempDate, setTempDate] = useState(new Date());
  const [tempTime, setTempTime] = useState(new Date());

  const showDatePicker = (fieldName) => {
    setTempDate(new Date());
    setDateModalVisible({ ...dateModalVisible, [fieldName]: true });
  };

  const hideDatePicker = (fieldName) => {
    setDateModalVisible({ ...dateModalVisible, [fieldName]: false });
  };

  const handleDateConfirm = (fieldName) => {
    setFieldValue(fieldName, tempDate.toISOString());
    hideDatePicker(fieldName);
  };

  const showTimePicker = (fieldName) => {
    setTempTime(new Date());
    setTimeModalVisible({ ...timeModalVisible, [fieldName]: true });
  };

  const hideTimePicker = (fieldName) => {
    setTimeModalVisible({ ...timeModalVisible, [fieldName]: false });
  };

  const handleTimeConfirm = (fieldName) => {
    const timeString = tempTime.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    setFieldValue(fieldName, timeString);
    hideTimePicker(fieldName);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const renderField = (field) => {
    const { name, label, type, options, multiline, editable = true } = field;
    const value = values[name];
    const error = touched[name] && errors[name];

    switch (type) {
      case 'text':
      case 'number':
        return (
          <View key={name}>
            <TextInput
              label={label}
              mode="outlined"
              value={value}
              onChangeText={(text) => setFieldValue(name, text)}
              keyboardType={type === 'number' ? 'numeric' : 'default'}
              multiline={multiline}
              numberOfLines={multiline ? 3 : 1}
              error={error}
              editable={editable}
              style={{ marginBottom: 8 }}
            />
            {error && <HelperText type="error">{error}</HelperText>}
          </View>
        );

      case 'textarea':
        return (
          <View key={name}>
            <TextInput
              label={label}
              mode="outlined"
              value={value}
              onChangeText={(text) => setFieldValue(name, text)}
              multiline={true}
              numberOfLines={3}
              error={error}
              style={{ marginBottom: 8 }}
            />
            {error && <HelperText type="error">{error}</HelperText>}
          </View>
        );

      case 'select':
        return (
          <View key={name}>
            <Menu
              visible={menuVisible[name] || false}
              onDismiss={() => setMenuVisible({ ...menuVisible, [name]: false })}
              anchor={
                <Button
                  mode="outlined"
                  onPress={() => setMenuVisible({ ...menuVisible, [name]: true })}
                  style={{ marginBottom: 8 }}
                >
                  {value || `Select ${label}`}
                </Button>
              }
            >
              {options.map((option) => (
                <Menu.Item
                  key={option}
                  onPress={() => {
                    setFieldValue(name, option);
                    setMenuVisible({ ...menuVisible, [name]: false });
                  }}
                  title={option}
                />
              ))}
            </Menu>
            {error && <HelperText type="error">{error}</HelperText>}
          </View>
        );

      case 'toggle':
        return (
          <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text variant="bodyMedium">{label}</Text>
            <Switch
              value={value}
              onValueChange={(newValue) => setFieldValue(name, newValue)}
            />
          </View>
        );

      case 'date':
        return (
          <View key={name}>
            <Button
              mode="outlined"
              onPress={() => showDatePicker(name)}
              style={{ marginBottom: 8 }}
            >
              {value ? formatDate(value) : `Select ${label}`}
            </Button>
            
            <Portal>
              <Modal
                visible={dateModalVisible[name] || false}
                onDismiss={() => hideDatePicker(name)}
                contentContainerStyle={{ backgroundColor: 'white', padding: 20, margin: 20, borderRadius: 8 }}
              >
                <Text variant="titleMedium" style={{ marginBottom: 16 }}>Select {label}</Text>
                
                {/* Simple date selection - you can enhance this with a proper date picker later */}
                <TextInput
                  label="Date (YYYY-MM-DD)"
                  mode="outlined"
                  value={value ? new Date(value).toISOString().split('T')[0] : ''}
                  onChangeText={(text) => {
                    if (text.match(/^\d{4}-\d{2}-\d{2}$/)) {
                      setFieldValue(name, new Date(text).toISOString());
                    }
                  }}
                  placeholder="2024-01-20"
                  style={{ marginBottom: 16 }}
                />
                
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <Button onPress={() => hideDatePicker(name)} style={{ marginRight: 8 }}>
                    Cancel
                  </Button>
                  <Button 
                    mode="contained" 
                    onPress={() => {
                      setFieldValue(name, new Date().toISOString());
                      hideDatePicker(name);
                    }}
                  >
                    Use Today
                  </Button>
                </View>
              </Modal>
            </Portal>
            
            {error && <HelperText type="error">{error}</HelperText>}
          </View>
        );

      case 'time':
        return (
          <View key={name}>
            <Button
              mode="outlined"
              onPress={() => showTimePicker(name)}
              style={{ marginBottom: 8 }}
            >
              {value || `Select ${label}`}
            </Button>
            
            <Portal>
              <Modal
                visible={timeModalVisible[name] || false}
                onDismiss={() => hideTimePicker(name)}
                contentContainerStyle={{ backgroundColor: 'white', padding: 20, margin: 20, borderRadius: 8 }}
              >
                <Text variant="titleMedium" style={{ marginBottom: 16 }}>Select {label}</Text>
                
                <TextInput
                  label="Time (HH:MM)"
                  mode="outlined"
                  value={value}
                  onChangeText={(text) => setFieldValue(name, text)}
                  placeholder="14:30"
                  style={{ marginBottom: 16 }}
                />
                
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <Button onPress={() => hideTimePicker(name)} style={{ marginRight: 8 }}>
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
                  >
                    Use Now
                  </Button>
                </View>
              </Modal>
            </Portal>
            
            {error && <HelperText type="error">{error}</HelperText>}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <Card.Title
        title={title}
        right={(props) => (
          <Button
            {...props}
            onPress={() => setExpanded(!expanded)}
            mode="text"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
        )}
      />
      {expanded && (
        <Card.Content>
          {fields.map(renderField)}
        </Card.Content>
      )}
    </Card>
  );
};

export default FormSection;