import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import Icon from "react-native-vector-icons/FontAwesome";

const GOLD = "#FCA311";
const BG = "#0D1B2A";
const ACTIVE_BG = "#FCA311";
const ACTIVE_ICON = "#0D1B2A";
const INACTIVE_ICON = "#FCA311";

const tabs = [
  { name: "index", icon: "home" },
  { name: "camera", icon: "camera" },
  { name: "indoor", icon: "building" },
  { name: "exterior", icon: "map" },
  { name: "audiobooks", icon: "headphones" },
  { name: "profile", icon: "user" },
  { name: "ask-a-friend-web", icon: "comments" },
  { name: "places", icon: "map-marker" },
];

export default function Footer({ navigation, state }: any) {
  const currentRoute = state?.routes?.[state.index]?.name;

  return (
    <View style={styles.footWrap}>
      <View style={styles.bottomBar}>
        {tabs.map((tab, index) => {
          const isActive = currentRoute === tab.name;

          return (
            <React.Fragment key={tab.name}>
              <Pressable
                onPress={() => navigation.navigate(tab.name)}
                style={[styles.bottomItem, isActive && styles.activeBottomItem]}
              >
                <Icon
                  name={tab.icon}
                  size={20}
                  color={isActive ? ACTIVE_ICON : INACTIVE_ICON}
                />
              </Pressable>

              {index !== tabs.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footWrap: {
    width: "100%",
    paddingHorizontal: 14,
    paddingBottom: 0,
    marginTop: 0,
    backgroundColor: BG,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: BG,
    borderColor: GOLD,
    borderRadius: 999,
    borderWidth: 2,
    paddingVertical: 16,
    paddingHorizontal: 10,
    overflow: "hidden",
    marginBottom: 20,
    marginTop: 20,
  },
  bottomItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 999,
  },
  activeBottomItem: {
    backgroundColor: ACTIVE_BG,
  },
  divider: {
    width: 2,
    height: "60%",
    backgroundColor: GOLD,
    opacity: 0.8,
  },
});