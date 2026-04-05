// app/ask-a-friend-web.tsx
// Web-specific "Ask a Friend" user interface
// Uses getUserMedia for camera and speechSynthesis for TTS

import { useEffect, useState, useRef, Fragment } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  collaborationService,
  SessionInfo,
  normalizeCode,
  roomFor,
} from "@/src/utils/collaboration";
import {
  initWebCamera,
  WebCameraCapture,
} from "@/src/utils/webCameraCapture";
import {
  speakWeb,
  stopWebSpeech,
  isWebTTSAvailable,
  isWebSpeaking,
} from "@/src/utils/webTTS";

export default function AskAFriendWebScreen() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [guideConnected, setGuideConnected] = useState(false);
  const [helperName, setHelperName] = useState<string | null>(null);
  const [guidanceMessage, setGuidanceMessage] = useState<string>("");
  const [isSpeakingGuidance, setIsSpeakingGuidance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDisconnectingRef = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] = useState<
    "granted" | "denied" | "prompt"
  >("prompt");
  const [microphonePermission, setMicrophonePermission] = useState<
    "granted" | "denied" | "prompt"
  >("prompt");
  const [isMuted, setIsMuted] = useState(false);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);

  const cameraRef = useRef<WebCameraCapture | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [showVideoElement, setShowVideoElement] = useState(false);
  const [cameraStreamReady, setCameraStreamReady] = useState(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const iceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const [webrtcConnected, setWebrtcConnected] = useState(false);
  const [helperReceivedVideo, setHelperReceivedVideo] = useState(false);
  const [helperReceivedAudio, setHelperReceivedAudio] = useState(false);
  const iceCandidateCountRef = useRef(0);
  const receivedIceCountRef = useRef(0);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  const [useFallbackMode, setUseFallbackMode] = useState(false);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const frameStreamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesSentCountRef = useRef(0);
  const frameStatsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      Alert.alert("Error", "This screen is only available on web browsers.");
      router.replace("/");
      return;
    }

    createSession();

    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    const unsubscribeConnected = collaborationService.onMessage(
      "connected",
      (msg) => {
        console.log("[AskAFriend] ✅ Connected to session:", msg);
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);

        if ((msg as any).guide_connected) {
          console.log("[AskAFriend] ✅ Guide already connected");
          setGuideConnected(true);
        }
      },
    );

    const unsubscribeGuideConnected = collaborationService.onMessage(
      "guide_connected",
      (msg) => {
        console.log("[AskAFriend] ✅ Guide connected:", msg);
        const helperNameFromMsg = (msg as any).helper_name || null;
        setGuideConnected(true);

        if (helperNameFromMsg) {
          setHelperName(helperNameFromMsg);
          if (isWebTTSAvailable()) {
            speakWeb(`${helperNameFromMsg} has joined as a helper.`);
          }
        } else {
          if (isWebTTSAvailable()) {
            speakWeb("Helper has joined. They can see your camera now.");
          }
        }

        if (
          streamRef.current &&
          videoRef.current &&
          isConnected &&
          cameraPermission === "granted"
        ) {
          console.log(
            "[AskAFriend] 🎥 Guide connected, starting frame streaming immediately",
          );
          if (!useFallbackMode) {
            activateFallbackMode();
          }
          startWebRTC();
        }
      },
    );

    const unsubscribeGuideDisconnected = collaborationService.onMessage(
      "guide_disconnected",
      () => {
        console.log("[AskAFriend] Guide disconnected");
        setGuideConnected(false);

        if (helperName && isWebTTSAvailable()) {
          speakWeb(`${helperName} has left the session.`);
        } else if (isWebTTSAvailable()) {
          speakWeb("Helper has left the session.");
        }

        setHelperName(null);
      },
    );

    const unsubscribeGuidance = collaborationService.onMessage(
      "guidance",
      (msg) => {
        const guidanceText = msg.text || msg.message || "";

        if (guidanceText && guidanceText.trim()) {
          const messageToDisplay = guidanceText.trim();

          if ((window as any).guidanceMessageTimeout) {
            clearTimeout((window as any).guidanceMessageTimeout);
          }

          setGuidanceMessage(messageToDisplay);
          setIsSpeakingGuidance(true);

          if (isWebTTSAvailable()) {
            speakWeb(messageToDisplay, {
              rate: 0.85,
              pitch: 1.0,
              volume: 1.0,
            });

            const checkSpeaking = setInterval(() => {
              if (!isWebSpeaking()) {
                setIsSpeakingGuidance(false);
                clearInterval(checkSpeaking);
              }
            }, 200);

            setTimeout(() => {
              setIsSpeakingGuidance(false);
              clearInterval(checkSpeaking);
            }, 30000);
          } else {
            setIsSpeakingGuidance(false);
          }

          (window as any).guidanceMessageTimeout = setTimeout(() => {
            setGuidanceMessage("");
            setIsSpeakingGuidance(false);
          }, 10000);
        }
      },
    );

    const unsubscribeError = collaborationService.onMessage("error", (msg) => {
      console.error("[AskAFriend] Error:", msg);
      setError(msg.message || "Connection error");
    });

    const unsubscribeVideoReceived = collaborationService.onMessage(
      "video_received" as any,
      () => {
        console.log("[AskAFriend] ✅ Helper confirmed video received!");
        setHelperReceivedVideo(true);

        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current);
          fallbackTimeoutRef.current = null;
        }

        if (useFallbackMode) {
          console.log("[AskAFriend] 🔄 WebRTC working, disabling fallback");
          setUseFallbackMode(false);
          stopFrameStreaming();
        }

        if (isWebTTSAvailable()) {
          speakWeb("Helper can now see your camera.");
        }
      },
    );

    const unsubscribeWebRTCAnswer = collaborationService.onMessage(
      "webrtc_answer",
      async (msg) => {
        const code = normalizeCode(sessionId || "");
        const room = roomFor(code);
        console.log(`[AskAFriend] 📥 Received WebRTC answer (room: ${room})`);

        if (peerConnectionRef.current && msg.sdp) {
          try {
            await peerConnectionRef.current.setRemoteDescription(
              new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit),
            );

            for (const candidate of iceCandidatesRef.current) {
              try {
                await peerConnectionRef.current.addIceCandidate(candidate);
              } catch (err) {
                console.warn(
                  "[AskAFriend] Failed to add pending ICE candidate:",
                  err,
                );
              }
            }
            iceCandidatesRef.current = [];
          } catch (error) {
            console.error(
              "[AskAFriend] ❌ Error handling WebRTC answer:",
              error,
            );
          }
        }
      },
    );

    const unsubscribeWebRTCICE = collaborationService.onMessage(
      "webrtc_ice",
      async (msg) => {
        const code = normalizeCode(sessionId || "");
        const room = roomFor(code);
        console.log(
          `[AskAFriend] 📥 Received WebRTC ICE candidate (room: ${room})`,
        );

        if (peerConnectionRef.current && msg.candidate) {
          try {
            const candidate = new RTCIceCandidate(
              msg.candidate as RTCIceCandidateInit,
            );

            if (peerConnectionRef.current.remoteDescription) {
              await peerConnectionRef.current.addIceCandidate(candidate);
            } else {
              iceCandidatesRef.current.push(candidate);
            }
          } catch (error) {
            console.error("[AskAFriend] ❌ Error adding ICE candidate:", error);
          }
        }
      },
    );

    if (typeof window !== "undefined") {
      (window as any).onTTSFinished = () => {
        setIsSpeakingGuidance(false);
      };
    }

    return () => {
      unsubscribeConnected();
      unsubscribeGuideConnected();
      unsubscribeGuideDisconnected();
      unsubscribeGuidance();
      unsubscribeError();
      unsubscribeWebRTCAnswer();
      unsubscribeWebRTCICE();
      unsubscribeVideoReceived();

      if (typeof window !== "undefined") {
        delete (window as any).onTTSFinished;
      }
    };
  }, [sessionId, isConnected, cameraPermission, useFallbackMode, helperName]);

  useEffect(() => {
    if (
      isConnected &&
      guideConnected &&
      cameraPermission === "granted" &&
      streamRef.current &&
      videoRef.current
    ) {
      if (!frameStreamIntervalRef.current) {
        if (!useFallbackMode) {
          setUseFallbackMode(true);
        }
        startFrameStreaming();
      }
    }
  }, [isConnected, guideConnected, cameraPermission, cameraStreamReady]);

  const createSession = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      const session: SessionInfo = await collaborationService.createSession();
      setSessionId(session.session_id);

      await collaborationService.connect(session.session_id, "user");
    } catch (err) {
      console.error("[AskAFriend] ❌ Error creating session:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create session";
      setError(errorMessage);
      setIsConnecting(false);

      Alert.alert(
        "Session Creation Failed",
        `Could not create session: ${errorMessage}\n\nPlease check:\n1. Backend is running\n2. Network connection is working`,
        [{ text: "OK" }],
      );
    }
  };

  const requestCameraPermission = async () => {
    try {
      setCameraError(null);
      setCameraPermission("prompt");
      setCameraStreamReady(false);

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        throw new Error("Camera API not available in this browser");
      }

      setShowVideoElement(true);

      await new Promise<void>((resolve) => {
        const checkVideo = () => {
          if (videoRef.current) {
            resolve();
          } else {
            requestAnimationFrame(() => {
              setTimeout(() => {
                if (videoRef.current) {
                  resolve();
                } else {
                  setTimeout(() => resolve(), 100);
                }
              }, 100);
            });
          }
        };
        requestAnimationFrame(checkVideo);
      });

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }

      let stream: MediaStream | null = null;
      let lastError: any = null;

      const cameraConfigs = [
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        },
        {
          video: { facingMode: "environment" },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        },
        {
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        },
        {
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        },
        {
          video: true,
          audio: true,
        },
      ];

      for (let i = 0; i < cameraConfigs.length; i++) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(cameraConfigs[i]);
          break;
        } catch (err: any) {
          lastError = err;
          if (
            err.name === "NotAllowedError" ||
            err.name === "PermissionDeniedError"
          ) {
            break;
          }
        }
      }

      if (!stream) {
        throw (
          lastError ||
          new Error("Failed to access camera after trying all configurations")
        );
      }

      if (!(stream instanceof MediaStream)) {
        throw new Error("Invalid stream returned from getUserMedia");
      }

      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      if (videoTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("No video tracks in stream");
      }

      if (audioTracks.length > 0) {
        localAudioTrackRef.current = audioTracks[0];
        setMicrophonePermission("granted");
        setHasAudioTrack(true);
      } else {
        setMicrophonePermission("denied");
      }

      streamRef.current = stream;
      setCameraStreamReady(true);

      const camera = initWebCamera();
      cameraRef.current = camera;

      setCameraPermission("granted");
    } catch (err: any) {
      console.error("[AskAFriend] Camera error:", err);
      setCameraPermission("denied");
      setCameraStreamReady(false);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      let errorMessage = "Failed to access camera";
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        errorMessage =
          "Camera permission denied. Please allow camera access in your browser settings and try again.";
      } else if (
        err.name === "NotFoundError" ||
        err.name === "DevicesNotFoundError"
      ) {
        errorMessage =
          "No camera found on this device. Please connect a camera or use a device with a camera.";
      } else if (
        err.name === "NotReadableError" ||
        err.name === "TrackStartError"
      ) {
        errorMessage =
          "Camera is already in use by another application. Please close other apps using the camera and try again.";
      } else if (err.name === "OverconstrainedError") {
        errorMessage =
          "Camera settings not supported. Please check your camera settings.";
      } else if (err.message) {
        errorMessage = err.message;
      } else {
        errorMessage =
          "Unable to access camera. Please check:\n1. Camera is connected\n2. Browser permissions are granted\n3. No other app is using the camera";
      }

      setCameraError(errorMessage);

      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (Platform.OS !== "web" || !cameraStreamReady || !streamRef.current) {
      return;
    }

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const attachStream = async () => {
      if (!videoRef.current) {
        retryTimeout = setTimeout(() => {
          if (!cancelled) attachStream();
        }, 100);
        return;
      }

      const video = videoRef.current;
      const stream = streamRef.current;

      if (!stream) return;

      try {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Video metadata timeout"));
          }, 10000);

          const onLoadedMetadata = () => {
            clearTimeout(timeout);
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("error", onError);
            resolve();
          };

          const onError = () => {
            clearTimeout(timeout);
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("error", onError);
            reject(new Error("Video element error"));
          };

          video.addEventListener("loadedmetadata", onLoadedMetadata);
          video.addEventListener("error", onError);
        });

        try {
          await video.play();

          if (cameraError && cameraError.includes("Tap the video")) {
            setCameraError(null);
          }

          if (cameraRef.current) {
            (cameraRef.current as any).video = video;
            (cameraRef.current as any).stream = stream;
          }
        } catch (playError: any) {
          console.warn(
            "[AskAFriend] Video play error (autoplay policy):",
            playError,
          );
          setCameraError("Tap the video to start playback");
        }
      } catch (err: any) {
        console.error("[AskAFriend] Error attaching stream:", err);
        setCameraError(err.message || "Failed to attach camera stream");
        setCameraPermission("denied");
        setCameraStreamReady(false);

        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        streamRef.current = null;
      }
    };

    attachStream();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [cameraStreamReady, showVideoElement, cameraError]);

  const copySessionCode = async () => {
    if (sessionId) {
      try {
        await navigator.clipboard.writeText(sessionId);
        Alert.alert("Copied!", "Session code copied to clipboard");
      } catch {
        const textArea = document.createElement("textarea");
        textArea.value = sessionId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        Alert.alert("Copied!", "Session code copied to clipboard");
      }
    }
  };

  const getHelperWebUrl = () => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      return `${origin}/helper-web`;
    }
    return "https://walkbuddy.com/helper-web";
  };

  const shareSession = async () => {
    if (!sessionId) return;

    const helperUrl = getHelperWebUrl();
    const normalizedCode = normalizeCode(sessionId || "");

    let shareText = `I need help navigating!\n\nSession Code: ${normalizedCode}\n\nHelper can join via:\n🌐 Web: ${helperUrl}`;

    if (helperUrl.includes("localhost") || helperUrl.includes("127.0.0.1")) {
      shareText += `\n\n⚠️ NOTE: If helper is on a different device, replace "localhost" with your LAN IP address.\nFind your LAN IP: ipconfig (Windows) or ifconfig (Mac/Linux)`;
    }

    shareText += `\n📱 Or use the WalkBuddy app Helper Mode`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "WalkBuddy Helper Session",
          text: shareText,
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        Alert.alert("Copied!", "Session details copied to clipboard");
      }
    } catch (err) {
      console.log("Share cancelled or failed:", err);
    }
  };

  const activateFallbackMode = () => {
    if (frameStreamIntervalRef.current) {
      return;
    }

    setUseFallbackMode(true);
    startFrameStreaming();
  };

  const startFrameStreaming = () => {
    if (frameStreamIntervalRef.current) {
      return;
    }

    if (!streamRef.current || !videoRef.current) {
      return;
    }

    if (!isConnected || !guideConnected) {
      return;
    }

    const video = videoRef.current;

    const waitForVideoReady = () => {
      if (!video) return;

      if (video.readyState < 2 || video.videoWidth === 0) {
        requestAnimationFrame(waitForVideoReady);
        return;
      }

      if (!canvasRef.current) {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        canvasRef.current = canvas;
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const frameInterval = 125;
      framesSentCountRef.current = 0;

      const captureFrame = () => {
        if (!video || !canvas || !ctx) return;
        if (!collaborationService.isConnected()) return;
        if (collaborationService.getRole() !== "user") return;
        if (!guideConnected) return;

        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const jpegBase64 = canvas.toDataURL("image/jpeg", 0.6);
          collaborationService.sendCameraFrame(jpegBase64);
          framesSentCountRef.current++;
        } catch (error) {
          console.error("[FRAME] ❌ Error capturing frame:", error);
        }
      };

      frameStreamIntervalRef.current = setInterval(captureFrame, frameInterval);
      setTimeout(() => {
        captureFrame();
      }, 100);

      frameStatsIntervalRef.current = setInterval(() => {
        framesSentCountRef.current = 0;
      }, 1000);
    };

    waitForVideoReady();
  };

  const stopFrameStreaming = () => {
    if (frameStreamIntervalRef.current) {
      clearInterval(frameStreamIntervalRef.current);
      frameStreamIntervalRef.current = null;
    }
    if (frameStatsIntervalRef.current) {
      clearInterval(frameStatsIntervalRef.current);
      frameStatsIntervalRef.current = null;
    }
    framesSentCountRef.current = 0;
  };

  const startWebRTC = async () => {
    if (!streamRef.current || !isConnected || !guideConnected) {
      return;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      iceCandidatesRef.current = [];
    }

    try {
      const stream = streamRef.current;
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        if (event.track.kind === "audio") {
          setHelperReceivedAudio(true);

          if (audioRef.current && event.streams && event.streams[0]) {
            const audioElement = audioRef.current;
            const audioStream = event.streams[0];

            audioElement.srcObject = audioStream;
            audioElement.volume = 1.0;
            audioElement.muted = false;

            audioElement.play().catch((err) => {
              console.error("[AskAFriend] ❌ Audio play error:", err);
              setTimeout(() => {
                audioElement.play().catch(() => {});
              }, 500);
            });

            event.track.onended = () => {
              setHelperReceivedAudio(false);
            };
          }
        } else if (event.track.kind === "video") {
          setHelperReceivedVideo(true);
        }
      };

      const tracksAdded = stream.getTracks();
      tracksAdded.forEach((track) => {
        pc.addTrack(track, stream);
        if (track.kind === "audio") {
          setHasAudioTrack(true);
        }
      });

      iceCandidateCountRef.current = 0;
      receivedIceCountRef.current = 0;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          iceCandidateCountRef.current++;
          collaborationService.sendWebRTCICE(event.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;

        if (state === "connected") {
          setWebrtcConnected(true);
          if (fallbackTimeoutRef.current) {
            clearTimeout(fallbackTimeoutRef.current);
            fallbackTimeoutRef.current = null;
          }
          if (useFallbackMode) {
            setUseFallbackMode(false);
            stopFrameStreaming();
          }
        } else if (state === "failed" || state === "disconnected") {
          setWebrtcConnected(false);
          setHelperReceivedVideo(false);
          if (!useFallbackMode && guideConnected && streamRef.current) {
            activateFallbackMode();
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;

        if (iceState === "failed") {
          if (!useFallbackMode && guideConnected && streamRef.current) {
            activateFallbackMode();
            setCameraError(null);
          } else {
            setCameraError("Video connection failed. Check network connectivity.");
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      collaborationService.sendWebRTCOffer(pc.localDescription!);
      setHelperReceivedVideo(false);

      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }

      fallbackTimeoutRef.current = setTimeout(() => {
        if (!helperReceivedVideo && guideConnected) {
          if (!useFallbackMode) {
            activateFallbackMode();
          }
        }
      }, 8000);

      if (guideConnected && !useFallbackMode) {
        activateFallbackMode();
      }
    } catch (error) {
      console.error("[AskAFriend] ❌ Error starting WebRTC:", error);
      setCameraError("Failed to start video streaming. Please try again.");
    }
  };

  const cleanup = () => {
    stopWebSpeech();

    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      iceCandidatesRef.current = [];
    }

    setWebrtcConnected(false);
    setHelperReceivedVideo(false);
    setHelperReceivedAudio(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.pause();
    }

    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.pause();
    }

    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current = null;
    }

    setIsConnected(false);
    setGuideConnected(false);
    setCameraStreamReady(false);
    setHelperReceivedAudio(false);
    setHelperReceivedVideo(false);
  };

  const toggleMute = () => {
    if (localAudioTrackRef.current) {
      const newMutedState = !isMuted;
      localAudioTrackRef.current.enabled = newMutedState;
      setIsMuted(newMutedState);
    }
  };

  const handleDisconnect = () => {
    if (isDisconnectingRef.current) return;

    isDisconnectingRef.current = true;
    cleanup();

    setSessionId(null);
    setGuidanceMessage("");
    setIsSpeakingGuidance(false);
    setHelperName(null);
    setError(null);
    setCameraError(null);
    setCameraPermission("prompt");
    setMicrophonePermission("prompt");
    setIsMuted(false);
    setHasAudioTrack(false);
    setUseFallbackMode(false);
    setShowVideoElement(false);

    collaborationService.disconnect();

    setTimeout(() => {
      router.replace("/");
      isDisconnectingRef.current = false;
    }, 100);
  };

  if (Platform.OS !== "web") {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          This screen is only available on web browsers.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.container}
    >
      <View style={styles.header}>
        <Pressable onPress={handleDisconnect} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#F9A826" />
        </Pressable>
        <Text style={styles.headerTitle}>Ask a Friend</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.statusBar}>
        <View
          style={[styles.statusDot, isConnected && styles.statusDotConnected]}
        />
        <Text style={styles.statusText}>
          {isConnecting
            ? "Connecting..."
            : isConnected
              ? guideConnected
                ? helperName
                  ? `${helperName} is helping you`
                  : "Helper is viewing your camera"
                : "Waiting for helper to join..."
              : "Not connected"}
        </Text>
      </View>

      {sessionId ? (
        <View style={styles.sessionContainer}>
          <Text style={styles.sessionLabel}>Session Code:</Text>
          <Pressable onPress={copySessionCode} style={styles.sessionCode}>
            <Text style={styles.sessionCodeText}>{sessionId}</Text>
            <Ionicons name="copy-outline" size={20} color="#F9A826" />
          </Pressable>
          <Text style={styles.sessionHint}>
            Share this code with your helper so they can join
          </Text>

          <View style={styles.webHelperContainer}>
            <Ionicons name="globe-outline" size={16} color="#F9A826" />
            <Text style={styles.webHelperText}>
              Helper can join via web: {getHelperWebUrl()}
            </Text>
          </View>

          <Pressable style={styles.shareButton} onPress={shareSession}>
            <Ionicons name="share-social" size={20} color="#1B263B" />
            <Text style={styles.shareButtonText}>Share Session Code</Text>
          </Pressable>
        </View>
      ) : isConnecting ? (
        <View style={styles.sessionContainer}>
          <ActivityIndicator size="large" color="#F9A826" />
          <Text style={styles.sessionHint}>Creating session...</Text>
        </View>
      ) : (
        <View style={styles.sessionContainer}>
          <Text style={styles.sessionLabel}>Session Code:</Text>
          <Pressable
            style={[
              styles.shareButton,
              { backgroundColor: "#F9A826", marginTop: 8 },
            ]}
            onPress={createSession}
          >
            <Ionicons name="refresh" size={20} color="#1B263B" />
            <Text style={styles.shareButtonText}>Create Session</Text>
          </Pressable>
          {error && (
            <Text
              style={{
                color: "#FF6B6B",
                marginTop: 8,
                fontSize: 12,
                textAlign: "center",
              }}
            >
              {error}
            </Text>
          )}
        </View>
      )}

      <View style={styles.cameraSection}>
        {Platform.OS === "web" && showVideoElement && (
          <Fragment>
            <audio
              ref={audioRef}
              autoPlay
              playsInline
              volume={1.0}
              style={{ display: "none" }}
              onLoadedMetadata={() => {
                if (audioRef.current) {
                  audioRef.current.volume = 1.0;
                  audioRef.current.muted = false;
                }
              }}
              onCanPlay={() => {
                if (audioRef.current && audioRef.current.paused) {
                  audioRef.current.play().catch(() => {});
                }
              }}
            />
          </Fragment>
        )}

        {cameraPermission === "granted" ? (
          <Fragment>
            <View style={styles.cameraPreview}>
              {Platform.OS === "web" && showVideoElement && (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onClick={() => {
                    if (videoRef.current && videoRef.current.paused) {
                      videoRef.current
                        .play()
                        .then(() => {
                          setCameraError(null);
                        })
                        .catch((err) => {
                          console.error(
                            "[AskAFriend] Failed to play on click:",
                            err,
                          );
                        });
                    }
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 12,
                    backgroundColor: "#000",
                    display: "block",
                    position: "absolute",
                    top: 0,
                    left: 0,
                    opacity: cameraPermission === "granted" ? 1 : 0,
                    pointerEvents: cameraPermission === "granted" ? "auto" : "none",
                    zIndex: 2,
                  }}
                />
              )}

              <View style={styles.cameraOverlay}>
                <Text style={styles.cameraStatusText}>
                  {useFallbackMode
                    ? "Camera Active - Fallback mode (frame stream)"
                    : webrtcConnected && helperReceivedVideo
                      ? "Camera Active - Helper viewing your camera"
                      : webrtcConnected
                        ? "Camera Active - Connecting video..."
                        : guideConnected
                          ? "Camera Active - Starting video stream..."
                          : "Camera Active - Waiting for helper"}
                </Text>

                {!!cameraError && cameraError.includes("Tap the video") && (
                  <Text style={styles.tapToPlayText}>
                    Tap video to start playback
                  </Text>
                )}

                {webrtcConnected && !helperReceivedVideo && !useFallbackMode && (
                  <Text style={styles.tapToPlayText}>
                    Establishing connection...
                  </Text>
                )}

                {useFallbackMode && (
                  <Text style={styles.tapToPlayText}>
                    Using reliable frame streaming
                  </Text>
                )}

                {helperReceivedAudio && (
                  <View style={styles.audioStatus}>
                    <Ionicons name="volume-high" size={16} color="#4CAF50" />
                    <Text style={styles.audioStatusText}>
                      Receiving audio from helper
                    </Text>
                    <Pressable
                      onPress={() => {
                        if (audioRef.current) {
                          audioRef.current.volume = 1.0;
                          audioRef.current.muted = false;
                          audioRef.current.play().catch(() => {
                            Alert.alert(
                              "Audio Playback",
                              "Unable to play audio. Check your browser's autoplay settings.",
                            );
                          });
                        }
                      }}
                      style={styles.testAudioButton}
                    >
                      <Ionicons name="play" size={14} color="#4CAF50" />
                      <Text style={styles.testAudioButtonText}>Test Audio</Text>
                    </Pressable>
                  </View>
                )}

                {hasAudioTrack && !isMuted && (
                  <View style={styles.micActiveIndicator}>
                    <View style={styles.micPulse} />
                    <Ionicons name="mic" size={16} color="#4CAF50" />
                    <Text style={styles.micActiveText}>Microphone active</Text>
                  </View>
                )}

                {hasAudioTrack && isMuted && (
                  <View style={styles.micMutedIndicator}>
                    <Ionicons name="mic-off" size={16} color="#FF6B6B" />
                    <Text style={styles.micMutedText}>Microphone muted</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.audioControlsContainer}>
              {hasAudioTrack ? (
                <Pressable
                  onPress={toggleMute}
                  style={[
                    styles.muteButton,
                    { backgroundColor: isMuted ? "#FF6B6B" : "#4CAF50" },
                  ]}
                >
                  <Ionicons
                    name={isMuted ? "mic-off" : "mic"}
                    size={20}
                    color="#FFFFFF"
                  />
                  <Text style={styles.muteButtonText}>
                    {isMuted ? "Unmute" : "Mute"}
                  </Text>
                </Pressable>
              ) : microphonePermission === "denied" ? (
                <View style={styles.micPermissionDenied}>
                  <Ionicons name="mic-off" size={20} color="#FF6B6B" />
                  <Text style={styles.micPermissionDeniedText}>
                    Microphone access denied
                  </Text>
                </View>
              ) : (
                <View style={styles.micLoading}>
                  <ActivityIndicator size="small" color="#F9A826" />
                  <Text style={styles.micLoadingText}>
                    Initializing microphone...
                  </Text>
                </View>
              )}
            </View>
          </Fragment>
        ) : cameraPermission === "denied" ? (
          <View style={styles.cameraError}>
            <Ionicons name="camera-outline" size={48} color="#FF6B6B" />
            <Text style={styles.cameraErrorText}>
              {cameraError || "Camera permission denied"}
            </Text>
            <Pressable
              style={styles.retryButton}
              onPress={requestCameraPermission}
            >
              <Text style={styles.retryButtonText}>Retry Camera Access</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cameraPrompt}>
            <Ionicons name="camera-outline" size={48} color="#F9A826" />
            <Text style={styles.cameraPromptText}>
              Enable camera to share your view with your helper
            </Text>
            <Pressable
              style={styles.enableButton}
              onPress={requestCameraPermission}
            >
              <Text style={styles.enableButtonText}>Enable Camera</Text>
            </Pressable>
          </View>
        )}
      </View>

      {!!guidanceMessage && (
        <View
          style={[
            styles.guidanceContainer,
            isSpeakingGuidance && { borderWidth: 2, borderColor: "#4CAF50" },
          ]}
        >
          <Ionicons
            name={isSpeakingGuidance ? "volume-high" : "chatbubble-ellipses"}
            size={24}
            color={isSpeakingGuidance ? "#4CAF50" : "#F9A826"}
          />
          <View style={styles.guidanceTextContainer}>
            <Text style={styles.guidanceText}>{guidanceMessage}</Text>
            {isSpeakingGuidance && (
              <View style={styles.speakingIndicator}>
                <View style={styles.speakingDot} />
                <Text style={styles.speakingText}>Speaking...</Text>
              </View>
            )}
          </View>
          {isSpeakingGuidance && (
            <Pressable
              onPress={() => {
                stopWebSpeech();
                setIsSpeakingGuidance(false);
              }}
              style={styles.stopSpeakingButton}
            >
              <Ionicons name="stop" size={16} color="#FF6B6B" />
            </Pressable>
          )}
        </View>
      )}

      {!!error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color="#FF6B6B" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable style={styles.disconnectButton} onPress={handleDisconnect}>
        <Ionicons name="close-circle" size={24} color="#FF6B6B" />
        <Text style={styles.disconnectButtonText}>Disconnect</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: "#1B263B",
  },
  container: {
    flex: 1,
    backgroundColor: "#1B263B",
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "#FFF",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#2A2A2A",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#666",
    marginRight: 8,
  },
  statusDotConnected: {
    backgroundColor: "#4CAF50",
  },
  statusText: {
    color: "#FFF",
    fontSize: 14,
  },
  sessionContainer: {
    padding: 16,
    backgroundColor: "#2A2A2A",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  sessionLabel: {
    color: "#AAA",
    fontSize: 12,
    marginBottom: 4,
  },
  sessionCode: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1B263B",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  sessionCodeText: {
    color: "#F9A826",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 4,
  },
  sessionHint: {
    color: "#888",
    fontSize: 12,
    marginBottom: 12,
  },
  webHelperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1B263B",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  webHelperText: {
    flex: 1,
    color: "#F9A826",
    fontSize: 11,
    lineHeight: 16,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9A826",
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  shareButtonText: {
    color: "#1B263B",
    fontSize: 14,
    fontWeight: "600",
  },
  cameraSection: {
    margin: 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    minHeight: 300,
  },
  cameraPreview: {
    width: "100%",
    minHeight: 300,
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 8,
    alignItems: "center",
    zIndex: 10,
  },
  cameraStatusText: {
    color: "#4CAF50",
    fontSize: 12,
    fontWeight: "600",
  },
  tapToPlayText: {
    color: "#F9A826",
    fontSize: 11,
    marginTop: 4,
    fontStyle: "italic",
  },
  cameraPrompt: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  cameraPromptText: {
    color: "#AAA",
    fontSize: 16,
    textAlign: "center",
  },
  enableButton: {
    backgroundColor: "#F9A826",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  enableButtonText: {
    color: "#1B263B",
    fontSize: 16,
    fontWeight: "600",
  },
  cameraError: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  cameraErrorText: {
    color: "#FF6B6B",
    fontSize: 16,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#F9A826",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#1B263B",
    fontSize: 16,
    fontWeight: "600",
  },
  guidanceContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  guidanceTextContainer: {
    flex: 1,
    gap: 4,
  },
  guidanceText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
  },
  speakingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
  },
  speakingText: {
    color: "#4CAF50",
    fontSize: 12,
    fontWeight: "500",
    fontStyle: "italic",
  },
  stopSpeakingButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: "#3A1F1F",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3A1F1F",
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: "#FF6B6B",
    fontSize: 14,
  },
  disconnectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3A1F1F",
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF6B6B",
    gap: 8,
  },
  disconnectButtonText: {
    color: "#FF6B6B",
    fontSize: 16,
    fontWeight: "600",
  },
  audioControlsContainer: {
    marginTop: 12,
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  muteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
    minWidth: 120,
  },
  muteButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  micPermissionDenied: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#3A1F1F",
    gap: 8,
  },
  micPermissionDeniedText: {
    color: "#FF6B6B",
    fontSize: 12,
    fontWeight: "500",
  },
  micLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  micLoadingText: {
    color: "#F9A826",
    fontSize: 12,
    fontWeight: "500",
  },
  audioStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    gap: 6,
  },
  audioStatusText: {
    color: "#4CAF50",
    fontSize: 12,
    fontWeight: "500",
  },
  micActiveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    gap: 6,
    position: "relative",
  },
  micPulse: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4CAF50",
    opacity: 0.5,
  },
  micActiveText: {
    color: "#4CAF50",
    fontSize: 12,
    fontWeight: "500",
  },
  micMutedIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    gap: 6,
  },
  micMutedText: {
    color: "#FF6B6B",
    fontSize: 12,
    fontWeight: "500",
  },
  testAudioButton: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: "#2A2A2A",
    gap: 4,
  },
  testAudioButtonText: {
    color: "#4CAF50",
    fontSize: 10,
    fontWeight: "500",
  },
});