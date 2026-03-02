// screens/SignupScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Animated,
  StatusBar,
  StyleSheet,
  TextInput as RNTextInput,
} from 'react-native';
import { Text, HelperText } from 'react-native-paper';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { useAuth } from '../utils/authHelpers';

const SignupSchema = Yup.object().shape({
  name: Yup.string().required('Name is required'),
  email: Yup.string().email('Invalid email').required('Email is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password'), null], 'Passwords must match')
    .required('Confirm Password is required'),
});

function StyledInput({ label, value, onChangeText, onBlur, error, secureTextEntry, keyboardType, autoCapitalize }) {
  const [focused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = () => {
    setFocused(true);
    Animated.timing(borderAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  };
  const handleBlur = (e) => {
    setFocused(false);
    Animated.timing(borderAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    onBlur && onBlur(e);
  };

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? '#ef4444' : '#1e2d45', error ? '#ef4444' : '#3b82f6'],
  });

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Animated.View style={[styles.inputContainer, { borderColor }]}>
        <RNTextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize || 'sentences'}
          placeholderTextColor="#3d506b"
          style={styles.input}
        />
      </Animated.View>
      {error ? <HelperText type="error" style={{ color: '#ef4444', fontSize: 11 }}>{error}</HelperText> : null}
    </View>
  );
}

export default function SignupScreen({ navigation }) {
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSignup = async (values) => {
    setLoading(true);
    try {
      await signUp(values.email, values.password, values.name);
    } catch (error) {
      alert('Signup failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1e" />
      <ScrollView
        style={{ flex: 1, backgroundColor: '#0a0f1e' }}
        contentContainerStyle={{ flexGrow: 1, padding: 28, paddingTop: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {/* Header */}
          <View style={{ marginBottom: 28 }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.pageTitle}>Create Account</Text>
            <Text style={styles.pageSub}>Join the KMRL fleet management system</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Formik
              initialValues={{ name: '', email: '', password: '', confirmPassword: '' }}
              validationSchema={SignupSchema}
              onSubmit={handleSignup}
            >
              {({ handleChange, handleBlur, handleSubmit, values, errors, touched }) => (
                <View>
                  <StyledInput
                    label="Full Name"
                    value={values.name}
                    onChangeText={handleChange('name')}
                    onBlur={handleBlur('name')}
                    error={touched.name && errors.name}
                  />
                  <StyledInput
                    label="Email Address"
                    value={values.email}
                    onChangeText={handleChange('email')}
                    onBlur={handleBlur('email')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    error={touched.email && errors.email}
                  />
                  <StyledInput
                    label="Password"
                    value={values.password}
                    onChangeText={handleChange('password')}
                    onBlur={handleBlur('password')}
                    secureTextEntry
                    error={touched.password && errors.password}
                  />
                  <StyledInput
                    label="Confirm Password"
                    value={values.confirmPassword}
                    onChangeText={handleChange('confirmPassword')}
                    onBlur={handleBlur('confirmPassword')}
                    secureTextEntry
                    error={touched.confirmPassword && errors.confirmPassword}
                  />

                  <TouchableOpacity
                    style={[styles.submitBtn, loading && { opacity: 0.6 }]}
                    onPress={handleSubmit}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.submitBtnText}>
                      {loading ? 'Creating account...' : 'Create Account'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => navigation.navigate('Login')}
                    style={{ alignItems: 'center', marginTop: 16 }}
                  >
                    <Text style={styles.linkText}>
                      Already have an account?{' '}
                      <Text style={styles.linkTextAccent}>Sign in</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </Formik>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    marginBottom: 16,
  },
  backBtnText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f0f4ff',
    letterSpacing: 0.3,
  },
  pageSub: {
    fontSize: 13,
    color: '#6b7fa3',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e2d45',
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#6b7fa3',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  inputContainer: {
    borderWidth: 1.5,
    borderRadius: 10,
    backgroundColor: '#0d1424',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 0,
  },
  input: {
    color: '#f0f4ff',
    fontSize: 15,
    paddingVertical: Platform.OS === 'android' ? 10 : 0,
  },
  submitBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  linkText: {
    fontSize: 13,
    color: '#6b7fa3',
  },
  linkTextAccent: {
    color: '#3b82f6',
    fontWeight: '600',
  },
});