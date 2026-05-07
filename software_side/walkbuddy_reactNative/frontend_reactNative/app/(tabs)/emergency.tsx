/*
   NOTE:
   The isEmergency variable is currently used to simulate different states.
   Part 2 adds: direction panel, Navigate/Call/Dismiss buttons, pulse effect,
   and voice assistant pill. Full functionality to be wired in future updates.
*/

import React, { useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Animated,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "react-native-vector-icons/FontAwesome";

export default function EmergencyScreen() {
  const router = useRouter();
  const isEmergency = false;
  const statusColor = isEmergency ? tokens.red : tokens.green;

  // Pulse animation for live dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const handleNavigate = () => {
    router.push("/search" as any);
  };

  const handleCall = () => {
    // Replace with real emergency number
    Linking.openURL("tel:000").catch(() =>
      Alert.alert("Error", "Unable to place call.")
    );
  };

  const handleDismiss = () => {
    Alert.alert(
      "Dismiss Alert",
      "Are you sure you want to dismiss this alert?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Dismiss",
          style: "destructive",
          onPress: () => router.back(),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.simpleHeader}>
          <Text style={styles.headerGreeting}>Emergency</Text>
          <Text style={styles.simpleHeaderTitle}>WalkBuddy</Text>
          <Icon name="user-circle" size={34} color={tokens.gold} />
        </View>

        <View style={styles.topDivider} />

        <View style={styles.mainArea}>
          {/* ── Status pill with pulse ── */}
          <View style={[styles.topBar, { borderColor: statusColor }]}>
            <Animated.View
              style={[
                styles.liveDot,
                { backgroundColor: statusColor, opacity: pulseAnim },
              ]}
            />
            <Text style={[styles.topBarText, { color: statusColor }]}>
              {isEmergency ? "ALERT ACTIVE" : "NO ALERT"}
            </Text>
          </View>

          {/* ── Alert header ── */}
          <View style={styles.alertHeader}>
            <View style={[styles.iconCircle, { borderColor: statusColor }]}>
              <Icon
                name={isEmergency ? "exclamation-triangle" : "smile-o"}
                size={46}
                color={statusColor}
              />
            </View>
            <Text style={[styles.title, { color: statusColor }]}>
              {isEmergency ? "Emergency Detected" : "No Emergency Detected"}
            </Text>
            <Text style={styles.subtitle}>
              {isEmergency
                ? "Safety guidance is now active"
                : "Everything is fine. No danger detected."}
            </Text>
          </View>

          {/* ── Status card ── */}
          <View style={[styles.statusCard, { borderColor: statusColor }]}>
            <Text style={styles.cardLabel}>
              {isEmergency ? "Detected Situation" : "Current Status"}
            </Text>
            <Text style={styles.cardTitle}>
              {isEmergency ? "Possible hazard nearby" : "Everything is clear"}
            </Text>
            <Text style={styles.cardText}>
              {isEmergency
                ? "Stay calm and follow the safety instructions shown on screen."
                : "No threat has been detected. The user can continue moving safely."}
            </Text>
          </View>

          {/* ── Voice card ── */}
          <View style={styles.voiceCard}>
            <Icon name="volume-up" size={22} color={tokens.gold} />
            <View style={styles.voiceTextBlock}>
              <Text style={styles.voiceTitle}>Voice assistant ready</Text>
              <Text style={styles.voiceText}>
                {isEmergency
                  ? "Emergency instructions will be read aloud for the user."
                  : "Voice guidance is available if the user needs assistance."}
              </Text>
            </View>
          </View>

          {/* ── Instruction card ── */}
          <View style={styles.instructionCard}>
            <Text style={styles.cardLabel}>
              {isEmergency ? "Next Step" : "Safe Message"}
            </Text>
            <Text style={styles.instructionText}>
              {isEmergency
                ? "Move away from the detected danger and wait for safe navigation guidance."
                : "No action is needed right now. Keep following the normal navigation guidance."}
            </Text>
          </View>

          {/* ════════════════════════════
              PART 2 — Direction + Buttons
          ════════════════════════════ */}

          {/* ── Direction panel ── */}
          <View style={styles.directionCard}>
            <Text style={styles.cardLabel}>Nearest exit</Text>
            <View style={styles.directionRow}>
              <View style={styles.arrowCircle}>
                <Icon name="arrow-up" size={26} color={tokens.gold} />
              </View>
              <View style={styles.directionInfo}>
                <Text style={styles.directionTitle}>Main Street Exit</Text>
                <Text style={styles.directionSub}>
                  Turn left at the intersection
                </Text>
              </View>
              <Text style={styles.directionDistance}>42m</Text>
            </View>
          </View>

          {/* ── Action buttons ── */}
          <View style={styles.buttonGrid}>
            <ActionButton
              icon="compass"
              label="NAVIGATE"
              color={tokens.gold}
              textColor={tokens.bg}
              filled
              onPress={handleNavigate}
            />
            <ActionButton
              icon="phone"
              label="CALL"
              color={tokens.green}
              onPress={handleCall}
            />
          </View>

          <ActionButton
            icon="times-circle"
            label="DISMISS ALERT"
            color={tokens.red}
            onPress={handleDismiss}
            wide
          />

          {/* ── Voice pill ── */}
          <View style={styles.voicePill}>
            <Animated.View
              style={[styles.voicePillDot, { opacity: pulseAnim }]}
            />
            <Icon name="microphone" size={15} color={tokens.gold} />
            <Text style={styles.voicePillText}>
              Voice assistant active — tap Navigate to begin
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Reusable action button with press feedback ──
function ActionButton({
  icon,
  label,
  color,
  textColor,
  filled = false,
  wide = false,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  textColor?: string;
  filled?: boolean;
  wide?: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 22,
      bounciness: 8,
    }).start();
  };

  const resolvedText = textColor ?? color;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={wide ? { width: "100%", marginBottom: 12 } : { flex: 1 }}
    >
      <Animated.View
        style={[
          styles.actionBtn,
          wide && styles.actionBtnWide,
          {
            borderColor: color,
            backgroundColor: filled ? color : "transparent",
            transform: [{ scale }],
          },
        ]}
      >
        <Icon name={icon} size={22} color={resolvedText} />
        <Text style={[styles.actionBtnText, { color: resolvedText }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const tokens = {
  bg: "#071a2a",
  card: "#08131f",
  cardDark: "#0b0f14",
  text: "#e8eef6",
  muted: "#b8c6d4",
  gold: "#f2a900",
  red: "#ff3b30",
  green: "#34c759",
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 120 },

  simpleHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#11273a",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    elevation: 5,
  },
  headerGreeting: {
    color: tokens.text,
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    zIndex: 1,
  },
  simpleHeaderTitle: {
    color: tokens.text,
    fontSize: 30,
    fontWeight: "900",
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
  },

  topDivider: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.gold,
    marginBottom: 12,
  },

  mainArea: { width: "100%", paddingHorizontal: 12, paddingTop: 20 },

  topBar: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#151116",
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 34,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8,
  },
  topBarText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },

  alertHeader: { alignItems: "center", marginBottom: 26 },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2.5,
    backgroundColor: "#130b0b",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontSize: 31, fontWeight: "900", textAlign: "center", letterSpacing: 0.4 },
  subtitle: {
    color: tokens.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },

  statusCard: {
    width: "100%",
    backgroundColor: tokens.card,
    borderWidth: 1.5,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
  },
  cardLabel: {
    color: tokens.gold,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  cardTitle: { color: tokens.text, fontSize: 20, fontWeight: "900", marginBottom: 8 },
  cardText: { color: tokens.muted, fontSize: 15, fontWeight: "700", lineHeight: 22 },

  voiceCard: {
    width: "100%",
    backgroundColor: tokens.cardDark,
    borderWidth: 2,
    borderColor: tokens.gold,
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  voiceTextBlock: { flex: 1, marginLeft: 14 },
  voiceTitle: { color: tokens.text, fontSize: 16, fontWeight: "900", marginBottom: 4 },
  voiceText: { color: tokens.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 },

  instructionCard: {
    width: "100%",
    backgroundColor: "#0a121a",
    borderWidth: 1.5,
    borderColor: "#29445f",
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
  },
  instructionText: { color: tokens.text, fontSize: 16, fontWeight: "800", lineHeight: 23 },

  // ── Part 2 styles ──

  directionCard: {
    width: "100%",
    backgroundColor: tokens.cardDark,
    borderWidth: 2,
    borderColor: tokens.gold,
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
  },
  directionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  arrowCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: tokens.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  directionInfo: { flex: 1 },
  directionTitle: { color: tokens.text, fontSize: 16, fontWeight: "900", marginBottom: 3 },
  directionSub: { color: tokens.muted, fontSize: 13, fontWeight: "700" },
  directionDistance: { color: tokens.gold, fontSize: 24, fontWeight: "900" },

  buttonGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  actionBtn: {
    borderWidth: 2,
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnWide: {
    flexDirection: "row",
    paddingVertical: 16,
    gap: 10,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  voicePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: tokens.cardDark,
    borderWidth: 1.5,
    borderColor: tokens.gold,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  voicePillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.gold,
  },
  voicePillText: {
    color: tokens.muted,
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
});