import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";

import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/theme/colors";

export function AudioPlayback({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const mounted = useRef(true);
  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const play = async (restart = false) => {
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        allowsBackgroundRecording: false,
        shouldPlayInBackground: false,
        playsInSilentMode: true,
        interruptionMode: "mixWithOthers",
      });
      if (!mounted.current) return;
      if (restart || status.didJustFinish || status.currentTime >= duration - 0.1) {
        await player.seekTo(0);
      }
      if (mounted.current) player.play();
    } catch {
      // The managed player may be released while an async seek is settling.
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Text style={styles.time}>
          {formatTime(status.currentTime)} / {formatTime(duration)}
        </Text>
        <View style={styles.actions}>
          <PressableScale
            collapsed
            onPress={() => {
              if (status.playing) player.pause();
              else void play();
            }}
            accessibilityLabel={status.playing ? "Pause recording" : "Play recording"}
            style={styles.iconButton}
          >
            <Ionicons
              name={status.playing ? "pause" : "play"}
              size={18}
              color="#F6F5F0"
            />
          </PressableScale>
          <PressableScale
            collapsed
            onPress={() => void play(true)}
            accessibilityLabel="Restart playback"
            style={styles.iconButton}
          >
            <Ionicons name="play-back" size={18} color="#F6F5F0" />
          </PressableScale>
        </View>
      </View>
      {status.error && <Text style={styles.error}>Playback is unavailable. Try recording again.</Text>}
    </View>
  );
}

function formatTime(seconds: number) {
  const rounded = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(
    rounded % 60,
  ).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.roomCard,
    borderWidth: 1,
    borderColor: colors.roomLine,
    borderRadius: 18,
    padding: 16,
    marginTop: 18,
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "#3A3832",
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 13,
  },
  time: {
    color: "#B9B8B0",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#34322D",
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    color: colors.warning,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 10,
  },
});
