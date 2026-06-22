import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async () => {
    setError(null);
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      } else {
        if (!name.trim()) {
          setError("Please enter your name.");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });
        if (error) setError(error.message);
        else Alert.alert("Check your email", "We sent a confirmation link to " + email);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Enter your email to reset your password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) setError(error.message);
    else Alert.alert("Reset link sent", "Check your email for a password reset link.");
  };

  const styles = StyleSheet.create({
    container: { flex: 1 },
    gradient: { flex: 1 },
    scroll: { flexGrow: 1 },
    inner: {
      flex: 1,
      paddingHorizontal: 28,
      paddingTop: insets.top + 60,
      paddingBottom: insets.bottom + 40,
      justifyContent: "center",
    },
    logoRow: { alignItems: "center", marginBottom: 48 },
    logoCircle: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    appName: {
      fontSize: 34,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -1,
    },
    tagline: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 6,
    },
    tabRow: {
      flexDirection: "row",
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      padding: 4,
      marginBottom: 28,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: colors.radius - 2,
    },
    tabActive: { backgroundColor: colors.card },
    tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    tabTextActive: { color: colors.foreground },
    inputGroup: { gap: 12, marginBottom: 20 },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
    },
    input: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    eyeBtn: { padding: 4 },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      marginBottom: 12,
      textAlign: "center",
    },
    primaryBtn: {
      borderRadius: colors.radius,
      overflow: "hidden",
      marginBottom: 16,
    },
    primaryBtnGradient: {
      paddingVertical: 16,
      alignItems: "center",
    },
    primaryBtnText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: "#FFFFFF",
    },
    forgotBtn: { alignItems: "center", marginTop: 4 },
    forgotText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <LinearGradient
        colors={["#1A0A14", "#0E0E0E"]}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inner}>
            <View style={styles.logoRow}>
              <View style={styles.logoCircle}>
                <Feather name="music" size={32} color="#FFFFFF" />
              </View>
              <Text style={styles.appName}>Synth</Text>
              <Text style={styles.tagline}>Find friends for local events</Text>
            </View>

            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, mode === "signin" && styles.tabActive]}
                onPress={() => { setMode("signin"); setError(null); }}
              >
                <Text style={[styles.tabText, mode === "signin" && styles.tabTextActive]}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, mode === "signup" && styles.tabActive]}
                onPress={() => { setMode("signup"); setError(null); }}
              >
                <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>Sign Up</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              {mode === "signup" && (
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="Your name"
                    placeholderTextColor={colors.mutedForeground}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              )}
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor={colors.mutedForeground}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.primaryBtn} onPress={handleAuth} disabled={loading}>
              <LinearGradient
                colors={["#CC2486", "#8D1FF4"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtnGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {mode === "signin" ? "Sign In" : "Create Account"}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {mode === "signin" && (
              <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword} disabled={loading}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}
