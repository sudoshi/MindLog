// =============================================================================
// MindLog Mobile — VoiceRecorder component
// Animated waveform UI, start/stop controls, 5-minute max, real-time amplitude.
// Uploads recording to /api/v1/voice/transcribe via apiFetch.
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  ActivityIndicator, Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { COLOR, FONTS, RADIUS } from '../constants/DesignTokens';
import { apiFetch } from '../services/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceRecorderProps {
  /** Called when transcription completes successfully */
  onTranscript: (text: string) => void;
  /** Called if the user cancels without transcribing */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const BAR_COUNT        = 20;
const PULSE_INTERVAL   = 500; // ms between pulse cycles when silent

// ---------------------------------------------------------------------------
// VoiceRecorder
// ---------------------------------------------------------------------------

export function VoiceRecorder({ onTranscript, onCancel }: VoiceRecorderProps) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'uploading' | 'error'>('idle');
  const [elapsed, setElapsed] = useState(0);        // seconds
  const [errorMsg, setErrorMsg] = useState('');

  const recordingRef  = useRef<Audio.Recording | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim     = useRef(new Animated.Value(1)).current;

  // Bar heights (20 bars driven by metering data or idle animation)
  const barAnims = useRef<Animated.Value[]>(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(4)),
  ).current;

  // ---------------------------------------------------------------------------
  // Idle pulse animation — red dot
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'recording') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: PULSE_INTERVAL, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: PULSE_INTERVAL, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulseAnim]);

  // ---------------------------------------------------------------------------
  // Metering → waveform bars
  // ---------------------------------------------------------------------------
  const updateBars = useCallback((level: number) => {
    // level: -160..0 (dBFS). Normalise to 0..1
    const norm = Math.max(0, Math.min(1, (level + 60) / 60));
    barAnims.forEach((anim, i) => {
      const rand  = Math.random() * 0.4 + 0.6; // slight randomness per bar
      const height = Math.max(4, Math.round(norm * rand * 48));
      Animated.timing(anim, {
        toValue:         height,
        duration:        80,
        useNativeDriver: false,
      }).start();
    });
  }, [barAnims]);

  // ---------------------------------------------------------------------------
  // Start recording
  // ---------------------------------------------------------------------------
  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Microphone access', 'Please enable microphone access in Settings to use voice journaling.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:           true,
        playsInSilentModeIOS:         true,
        shouldDuckAndroid:            true,
        playThroughEarpieceAndroid:   false,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      } as Audio.RecordingOptions);

      rec.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording && status.metering !== undefined) {
          updateBars(status.metering);
        }
        if (status.durationMillis && status.durationMillis >= MAX_DURATION_MS) {
          void stopRecording();
        }
      });

      await rec.startAsync();
      recordingRef.current = rec;
      setPhase('recording');
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not start recording');
      setPhase('error');
    }
  };

  // ---------------------------------------------------------------------------
  // Stop recording → upload → transcribe
  // ---------------------------------------------------------------------------
  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setPhase('uploading');

      if (!uri) throw new Error('No audio file recorded');

      // Build multipart body
      const formData = new FormData();
      formData.append('audio', {
        uri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      } as unknown as Blob);

      const res = await apiFetch('/voice/transcribe', {
        method: 'POST',
        headers: {}, // let fetch set Content-Type for multipart
        body:   formData,
      });

      const json = (await res.json()) as {
        success: boolean;
        data?: { transcript: string; duration_seconds: number };
        error?: { message: string };
      };

      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? 'Transcription failed');
      }

      onTranscript(json.data.transcript);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transcription failed');
      setPhase('error');
    }
  }, [onTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingRef.current) {
        void recordingRef.current.stopAndUnloadAsync().catch(() => null);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Countdown helper
  // ---------------------------------------------------------------------------
  const remaining  = MAX_DURATION_MS / 1000 - elapsed;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(Math.floor(remaining % 60)).padStart(2, '0');
  const showWarning = remaining <= 30;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* Waveform bars */}
      <View style={styles.waveform} accessibilityLabel="Audio waveform">
        {barAnims.map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                height: anim,
                backgroundColor: phase === 'recording' ? COLOR.DANGER : COLOR.INK_GHOST,
              },
            ]}
          />
        ))}
      </View>

      {/* Recording dot + timer */}
      {phase === 'recording' && (
        <View style={styles.statusRow}>
          <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
          <Text style={[styles.timer, showWarning && styles.timerWarning]}>
            {mm}:{ss}
          </Text>
        </View>
      )}

      {/* Uploading spinner */}
      {phase === 'uploading' && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={COLOR.PRIMARY} />
          <Text style={styles.uploadText}>Transcribing…</Text>
        </View>
      )}

      {/* Error */}
      {phase === 'error' && (
        <Text style={styles.errorText}>{errorMsg}</Text>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {phase === 'idle' && (
          <TouchableOpacity
            style={styles.recordBtn}
            onPress={() => void startRecording()}
            accessibilityLabel="Start voice recording"
            accessibilityRole="button"
          >
            <Text style={styles.recordBtnText}>🎙 Start Recording</Text>
          </TouchableOpacity>
        )}
        {phase === 'recording' && (
          <TouchableOpacity
            style={[styles.recordBtn, styles.stopBtn]}
            onPress={() => void stopRecording()}
            accessibilityLabel="Stop and transcribe recording"
            accessibilityRole="button"
          >
            <Text style={styles.recordBtnText}>⏹ Stop & Transcribe</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          accessibilityLabel="Cancel voice recording"
          accessibilityRole="button"
          disabled={phase === 'uploading'}
        >
          <Text style={styles.cancelBtnText}>
            {phase === 'error' ? 'Dismiss' : 'Cancel'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLOR.SURFACE_2,
    borderRadius:    RADIUS.MD,
    padding:         20,
    alignItems:      'center',
    gap:             16,
  },
  waveform: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:             3,
    height:          56,
  },
  bar: {
    width:        4,
    borderRadius: 2,
    minHeight:    4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            8,
  },
  dot: {
    width:           10,
    height:          10,
    borderRadius:     5,
    backgroundColor:  COLOR.DANGER,
  },
  timer: {
    color:      COLOR.INK,
    fontFamily: FONTS.SANS_SEMIBOLD,
    fontSize:   16,
  },
  timerWarning: {
    color: COLOR.WARNING,
  },
  uploadText: {
    color:      COLOR.INK_MID,
    fontFamily: FONTS.SANS,
    fontSize:   14,
  },
  errorText: {
    color:      COLOR.DANGER,
    fontFamily: FONTS.SANS,
    fontSize:   13,
    textAlign:  'center',
  },
  controls: {
    width:  '100%',
    gap:    10,
  },
  recordBtn: {
    backgroundColor: COLOR.DANGER,
    borderRadius:    RADIUS.SM,
    padding:         14,
    alignItems:      'center',
    minHeight:       44,
    justifyContent:  'center',
  },
  stopBtn: {
    backgroundColor: COLOR.SURFACE_4,
  },
  recordBtnText: {
    color:      COLOR.WHITE,
    fontFamily: FONTS.SANS_BOLD,
    fontSize:   15,
  },
  cancelBtn: {
    padding:      10,
    alignItems:   'center',
    minHeight:    44,
    justifyContent: 'center',
  },
  cancelBtnText: {
    color:      COLOR.INK_SOFT,
    fontFamily: FONTS.SANS,
    fontSize:   14,
  },
});
