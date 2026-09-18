"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  saveRecording,
  loadRecordings,
  deleteRecording as deleteStoredRecording,
  checkStorageSupport,
} from "@/lib/audio-storage";
import toast from "react-hot-toast";

export interface VoiceRecording {
  id: string;
  blob: Blob;
  dataUrl: string;
  mimeType: string;
  timestamp: string;
  duration: number;
  instanceId?: string; // Track which panel created this recording
}

export function useVoiceRecorder(
  maxDuration: number = 10000,
  instanceId?: string
) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isSupported, setIsSupported] = useState(true);
  const [supportInfo, setSupportInfo] = useState({
    indexedDB: false,
    localStorage: false,
    mediaRecorder: false,
    getUserMedia: false,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Check feature support and load recordings on mount
  useEffect(() => {
    const support = checkStorageSupport();
    setSupportInfo(support);

    if (!support.mediaRecorder || !support.getUserMedia) {
      setIsSupported(false);
    }

    loadRecordings()
      .then((loaded) => setRecordings(loaded))
      .catch((error) => {
        console.error("Error loading recordings:", error);
      });
  }, []);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  const startRecording = useCallback(async () => {
    // Check secure context (HTTPS required)
    if (!window.isSecureContext) {
      throw new Error("Audio recording requires HTTPS");
    }

    // Check feature support
    if (!supportInfo.mediaRecorder || !supportInfo.getUserMedia) {
      throw new Error("Audio recording not supported on this device");
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Detect best supported audio format with fallbacks
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();

        reader.onloadend = async () => {
          const dataUrl = reader.result as string;
          const duration = Date.now() - startTimeRef.current;

          const recording: VoiceRecording = {
            id: `voice-${Date.now()}`,
            blob,
            dataUrl,
            mimeType,
            timestamp: new Date().toISOString(),
            duration,
            instanceId, // Track which panel created this recording
          };

          setRecordings((prev) => [...prev, recording]);

          // Save to IndexedDB with localStorage fallback
          try {
            await saveRecording(recording);
          } catch (error) {
            console.error("Failed to save recording:", error);
            if (error instanceof Error) {
              toast.error(error.message);
            }
          }
        };
        reader.readAsDataURL(blob);

        stream.getTracks().forEach((track) => track.stop());
      };

      startTimeRef.current = Date.now();
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Update timer every 100ms
      timerRef.current = setInterval(() => {
        setRecordingTime(Date.now() - startTimeRef.current);
      }, 100);

      // Auto-stop after maxDuration
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          stopRecording();
        }
      }, maxDuration);
    } catch (error) {
      console.error("Error accessing microphone:", error);

      let errorMessage = "Could not access microphone.";
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          errorMessage =
            "Microphone permission denied. Please enable in browser settings.";
        } else if (error.name === "NotFoundError") {
          errorMessage = "No microphone found on this device.";
        } else if (error.name === "NotSupportedError") {
          errorMessage = "Audio recording not supported on this browser.";
        } else {
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
      throw error;
    }
  }, [maxDuration, supportInfo, instanceId, stopRecording]);

  const deleteRecording = useCallback(async (id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    await deleteStoredRecording(id);
  }, []);

  return {
    isRecording,
    recordings,
    recordingTime,
    isSupported,
    supportInfo,
    startRecording,
    stopRecording,
    deleteRecording,
  };
}
