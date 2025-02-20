import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { useBeforeunload } from "react-beforeunload";
import { keyframes } from "@emotion/react";
import { FiAlertTriangle, FiPauseCircle } from "react-icons/fi";

import {
  useStudioState, useDispatch, Dispatcher, Recording as StudioRecording,
} from "../../studio-state";
import { useOpencast } from "../../opencast";

import { stopCapture } from "../../capturer";
import { StepProps } from "..";
import { ErrorBox } from "../../ui/ErrorBox";
import { StepContainer } from "../elements";
import { VideoBox, VideoBoxProps, useVideoBoxResize } from "../../ui/VideoBox";
import { COLORS, dimensionsOf } from "../../util";
import { RecordingControls } from "./controls";
import Recorder, { OnStopCallback } from "./recorder";
import { useSettings } from "../../settings";
import { useColorScheme } from "@opencast/appkit";


export type RecordingState = "inactive" | "paused" | "recording";


const addRecordOnStop = (
  dispatch: Dispatcher,
  deviceType: StudioRecording["deviceType"],
): OnStopCallback => {
  return ({ media, url, mimeType, dimensions }) => {
    dispatch({
      type: "ADD_RECORDING",
      recording: { deviceType, media, url, mimeType, dimensions },
    });
  };
};

const mixAudioIntoVideo = (audioStream: MediaStream | null, videoStream: MediaStream) => {
  if (!(audioStream?.getAudioTracks().length)) {
    return videoStream;
  }
  return new MediaStream([...videoStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
};


export const Recording: React.FC<StepProps> = ({ goToNextStep, goToPrevStep }) => {
  const { t } = useTranslation();
  const recordingDispatch = useDispatch();
  const opencast = useOpencast();
  const dispatch = useDispatch();
  const settings = useSettings();
  const state = useStudioState();
  const {
    displayStream, userStream, displayUnexpectedEnd, userUnexpectedEnd, audioUnexpectedEnd,
  } = state;

  const [recordingState, setRecordingState] = useState<RecordingState>("inactive");

  const desktopRecorder = useRef<Recorder>();
  const videoRecorder = useRef<Recorder>();

  const canRecord = (displayStream || userStream)
    && !userUnexpectedEnd && !displayUnexpectedEnd && !audioUnexpectedEnd;

  const startRecording = () => {
    // In theory, we should never have recordings at this point. But just to be
    // sure, in case of a bug elsewhere, we clear the recordings here.
    dispatch({ type: "CLEAR_RECORDINGS" });

    if (displayStream) {
      const onStop = addRecordOnStop(dispatch, "desktop");
      const stream = mixAudioIntoVideo(state.audioStream, displayStream);
      desktopRecorder.current = new Recorder(stream, settings.recording, onStop);
      desktopRecorder.current.start();
    }

    if (userStream) {
      const onStop = addRecordOnStop(dispatch, "video");
      const stream = mixAudioIntoVideo(state.audioStream, userStream);
      videoRecorder.current = new Recorder(stream, settings.recording, onStop);
      videoRecorder.current.start();
    }

    setRecordingState("recording");
    dispatch({ type: "START_RECORDING" });
  };

  const stopRecording = (premature: boolean) => {
    desktopRecorder.current?.stop();
    videoRecorder.current?.stop();
    dispatch({ type: premature ? "STOP_RECORDING_PREMATURELY" : "STOP_RECORDING" });
    opencast.refreshConnection();
    stopCapture(state, recordingDispatch);
    goToNextStep();
  };

  const pauseRecording = () => {
    setRecordingState("paused");
    desktopRecorder.current?.pause();
    videoRecorder.current?.pause();
  };

  const resumeRecording = () => {
    setRecordingState("recording");
    desktopRecorder.current?.resume();
    videoRecorder.current?.resume();
  };

  const paused = recordingState === "paused";
  const previews: VideoBoxProps["children"] = [];
  if (displayStream || displayUnexpectedEnd) {
    previews.push({
      body: <StreamPreview stream={displayStream} paused={paused} />,
      dimensions: () => dimensionsOf(displayStream),
    });
  }
  if (userStream || userUnexpectedEnd) {
    previews.push({
      body: <StreamPreview stream={userStream} paused={paused} />,
      dimensions: () => dimensionsOf(userStream),
    });
  }

  useBeforeunload(event => {
    if (recordingState !== "inactive") {
      event.preventDefault();
    }
  });

  return (
    <StepContainer
      title={t("steps.record.label")}
      prevButton={{
        onClick: goToPrevStep,
        disabled: recordingState !== "inactive",
      }}
      nextButton={{
        onClick: () => stopRecording(false),
        disabled: recordingState !== "paused",
        label: t("stop-button-title"),
      }}
    >
      {(displayUnexpectedEnd || userUnexpectedEnd) && (
        <ErrorBox body={t("error-lost-video-stream")} />
      )}
      {audioUnexpectedEnd && (
        <ErrorBox body={t("error-lost-audio-stream")} />
      )}

      <VideoBox gap={20}>{previews}</VideoBox>
      <div css={{ position: "absolute", bottom: 32, width: "100%" }}>
        {canRecord && (
          <RecordingControls {...{
            startRecording,
            stopRecording,
            pauseRecording,
            resumeRecording,
            recordingState,
          }} />
        )}
      </div>
    </StepContainer>
  );
};


type StreamPreviewProps = {
  stream: MediaStream | null;
  paused: boolean;
};

const StreamPreview: React.FC<StreamPreviewProps> = ({ stream, paused }) => {
  const resizeVideoBox = useVideoBoxResize();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isHighContrast } = useColorScheme();

  useEffect(() => {
    const v = videoRef.current;
    if (v && stream) {
      if (!v.srcObject) {
        v.srcObject = stream;
      }
      v.addEventListener("resize", resizeVideoBox);

      if (paused) {
        v.pause();
      } else {
        v.play();
      }

      return () => v.removeEventListener("resize", resizeVideoBox);
    }
  });

  if (!stream) {
    return (
      <div css={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: COLORS.danger4,
      }}>
        <FiAlertTriangle size={48} />
      </div>
    );
  }

  return (
    <div
      css={{
        position: "relative",
        boxShadow: isHighContrast ? "none" : "0 2px 12px rgba(0, 0, 0, 0.35)",
        overflow: "hidden",
        height: "100%",
      }}
    >
      {paused && <PauseOverlay />}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        tabIndex={-1}
        css={{
          outline: "none",
          width: "100%",
          height: "100%",
          background: "transparent",
        }}
      ></video>
    </div>
  );
};

const PauseOverlay: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      css={{
        position: "absolute",
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(50, 50, 50, 0.7)",
      }}
    >
      <div css={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        gap: 8,
        fontSize: 20,
        marginTop: 32,
        textShadow: "0 0 12px rgba(0, 0, 0, 0.6)",
        animation: `2s ease-in-out infinite none ${keyframes({
          "0%": { opacity: 1 },
          "50%": { opacity: 0.7 },
          "100%": { opacity: 1 },
        })}`,
      }}>
        <FiPauseCircle css={{ fontSize: 26 }} />
        {t("steps.record.is-paused")}
      </div>
    </div>
  );
};
