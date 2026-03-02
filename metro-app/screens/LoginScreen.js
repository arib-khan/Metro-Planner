// screens/LoginScreen.js
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

const LoginSchema = Yup.object().shape({
  email: Yup.string().email('Invalid email').required('Email is required'),
  password: Yup.string().required('Password is required'),
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

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      await signIn(values.email, values.password);
    } catch (error) {
      alert('Login failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1e" />
      <ScrollView
        style={{ flex: 1, backgroundColor: '#0a0f1e' }}
        contentContainerStyle={{ flexGrow: 1, padding: 28, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {/* Logo area */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoIcon}>🚇</Text>
            </View>
            <Text style={styles.logoTitle}>KMRL</Text>
            <Text style={styles.logoSubtitle}>Train Induction System</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardSub}>Access your fleet management dashboard</Text>

            <Formik
              initialValues={{ email: '', password: '' }}
              validationSchema={LoginSchema}
              onSubmit={handleLogin}
            >
              {({ handleChange, handleBlur, handleSubmit, values, errors, touched }) => (
                <View>
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

                  <TouchableOpacity
                    style={[styles.submitBtn, loading && { opacity: 0.6 }]}
                    onPress={handleSubmit}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.submitBtnText}>
                      {loading ? 'Signing in...' : 'Sign In'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => navigation.navigate('Signup')}
                    style={{ alignItems: 'center', marginTop: 16 }}
                  >
                    <Text style={styles.linkText}>
                      Don't have an account?{' '}
                      <Text style={styles.linkTextAccent}>Create one</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </Formik>
          </View>

          <Text style={styles.footerText}>Kochi Metro Rail Limited · Secure Login</Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logoArea: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#111827',
    borderWidth: 1.5,
    borderColor: '#1e2d45',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  logoIcon: { fontSize: 34 },
  logoTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f0f4ff',
    letterSpacing: 4,
  },
  logoSubtitle: {
    fontSize: 12,
    color: '#6b7fa3',
    marginTop: 4,
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e2d45',
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f0f4ff',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 12,
    color: '#6b7fa3',
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
  footerText: {
    textAlign: 'center',
    fontSize: 10,
    color: '#3d506b',
    letterSpacing: 1,
  },
});