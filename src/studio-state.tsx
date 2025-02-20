import { createContext, useReducer } from "react";
import { assertNever } from "@opencast/appkit";

import { isDisplayCaptureSupported, isUserCaptureSupported, usePresentContext } from "./util";


export type AudioSource = "microphone" | "none";
export type VideoSource = "both" | "display" | "user" | "none";
export type UploadState = "not_uploaded" | "uploading" | "uploaded" | "error";

export type Recording = {
  deviceType: "desktop" | "video";
  media: Blob;
  url: string;
  mimeType: string;
  dimensions: [number, number] | null;
  downloaded?: boolean;
};

/** Our global state */
export type StudioState = {
  hasWebcam: boolean;
  mediaDevices: MediaDeviceInfo[];

  audioAllowed: null | boolean;
  audioStream: null | MediaStream;
  audioUnexpectedEnd: boolean;
  audioSupported: boolean;

  displayAllowed: null | boolean;
  displayStream: null | MediaStream;
  displayUnexpectedEnd: boolean;
  displaySupported: boolean;

  userAllowed: null | boolean;
  userStream: null | MediaStream;
  userUnexpectedEnd: boolean;
  userSupported: boolean;

  videoChoice: VideoSource;
  audioChoice: AudioSource;

  isRecording: boolean;
  prematureRecordingEnd: boolean;
  recordings: Recording[];

  title: string;
  presenter: string;

  start: null | number;
  end: null | number;

  recordingStartTime: null | Date;
  recordingEndTime: null | Date;

  upload: {
    error: null | string;
    state: UploadState;
    secondsLeft: null | number;
    currentProgress: number;
  };
};

const initialState = (hasWebcam: boolean): StudioState => ({
  hasWebcam,
  mediaDevices: [],

  audioAllowed: null,
  audioStream: null,
  audioUnexpectedEnd: false,
  audioSupported: isUserCaptureSupported(),

  displayAllowed: null,
  displayStream: null,
  displayUnexpectedEnd: false,
  displaySupported: isDisplayCaptureSupported(),

  userAllowed: null,
  userStream: null,
  userUnexpectedEnd: false,
  userSupported: isUserCaptureSupported(),

  videoChoice: "none",
  audioChoice: "none",

  isRecording: false,
  prematureRecordingEnd: false,
  recordings: [],

  title: "",
  presenter: "",

  start: null,
  end: null,

  recordingStartTime: null,
  recordingEndTime: null,

  upload: {
    error: null,
    state: "not_uploaded",
    secondsLeft: null,
    currentProgress: 0,
  },
});

/** Every possible action that can be passed to the reducer. */
type ReducerAction =
  | { type: "UPDATE_MEDIA_DEVICES"; devices: MediaDeviceInfo[] }
  | { type: "CHOOSE_AUDIO"; choice: AudioSource }
  | { type: "CHOOSE_VIDEO"; choice: VideoSource }
  | { type: "SHARE_AUDIO"; stream: MediaStream }
  | { type: "BLOCK_AUDIO" }
  | { type: "UNSHARE_AUDIO" }
  | { type: "AUDIO_UNEXPECTED_END" }
  | { type: "SHARE_DISPLAY"; stream: MediaStream }
  | { type: "BLOCK_DISPLAY" }
  | { type: "UNSHARE_DISPLAY" }
  | { type: "DISPLAY_UNEXPECTED_END" }
  | { type: "SHARE_USER"; stream: MediaStream }
  | { type: "BLOCK_USER" }
  | { type: "UNSHARE_USER" }
  | { type: "USER_UNEXPECTED_END" }
  | { type: "START_RECORDING" }
  | { type: "STOP_RECORDING" }
  | { type: "STOP_RECORDING_PREMATURELY" }
  | { type: "CLEAR_RECORDINGS" }
  | { type: "ADD_RECORDING"; recording: Recording }
  | { type: "UPLOAD_ERROR"; msg: string }
  | { type: "UPLOAD_REQUEST" }
  | { type: "UPLOAD_SUCCESS" }
  | { type: "UPLOAD_PROGRESS_UPDATE"; secondsLeft: number | null; currentProgress: number }
  | { type: "MARK_DOWNLOADED"; index: number }
  | { type: "UPDATE_TITLE"; value: string }
  | { type: "UPDATE_PRESENTER"; value: string }
  | { type: "UPDATE_START"; time: number | null }
  | { type: "UPDATE_END"; time: number | null }
  | { type: "RESET" };


const reducer = (state: StudioState, action: ReducerAction): StudioState => {
  switch (action.type) {
    case "UPDATE_MEDIA_DEVICES": return { ...state, mediaDevices: action.devices };
    case "CHOOSE_AUDIO": return { ...state, audioChoice: action.choice };
    case "CHOOSE_VIDEO": return { ...state, videoChoice: action.choice };

    case "SHARE_AUDIO": return {
      ...state,
      audioStream: action.stream,
      audioAllowed: true,
      audioUnexpectedEnd: false,
    };
    case "BLOCK_AUDIO":
      return { ...state, audioStream: null, audioAllowed: false, audioUnexpectedEnd: false };
    case "UNSHARE_AUDIO": return { ...state, audioStream: null, audioUnexpectedEnd: false };
    case "AUDIO_UNEXPECTED_END": return { ...state, audioStream: null, audioUnexpectedEnd: true };

    case "SHARE_DISPLAY": return {
      ...state,
      displayStream: action.stream,
      displayAllowed: true,
      displayUnexpectedEnd: false,
    };
    case "BLOCK_DISPLAY":
      return { ...state, displayStream: null, displayAllowed: false, displayUnexpectedEnd: false };
    case "UNSHARE_DISPLAY":
      return { ...state, displayStream: null, displayUnexpectedEnd: false };
    case "DISPLAY_UNEXPECTED_END":
      return { ...state, displayStream: null, displayUnexpectedEnd: true };

    case "SHARE_USER":
      return { ...state, userStream: action.stream, userAllowed: true, userUnexpectedEnd: false };
    case "BLOCK_USER":
      return { ...state, userStream: null, userAllowed: false, userUnexpectedEnd: false };
    case "UNSHARE_USER":
      return { ...state, userStream: null, userUnexpectedEnd: false };
    case "USER_UNEXPECTED_END":
      return { ...state, userStream: null, userUnexpectedEnd: true };

    case "START_RECORDING": return { ...state, isRecording: true, recordingStartTime: new Date() };
    case "STOP_RECORDING": return { ...state, isRecording: false, recordingEndTime: new Date() };
    case "STOP_RECORDING_PREMATURELY":
      return {
        ...state,
        isRecording: false,
        prematureRecordingEnd: true,
        recordingEndTime: new Date(),
      };
    case "CLEAR_RECORDINGS":
      return { ...state, recordings: [], prematureRecordingEnd: false };
    case "ADD_RECORDING":
      // We remove all recordings with the same device type as the new one. This
      // *should* in theory never happen as all recordings are cleared before
      // new ones can be added. However, in rare case, this might not be true
      // and the user ends up with strange recordings. Just to be sure, we
      // remove old recordings here.
      return {
        ...state,
        recordings: [
          ...state.recordings.filter(r => r.deviceType !== action.recording.deviceType),
          action.recording,
        ],
      };

    case "UPLOAD_ERROR":
      return { ...state, upload: { ...state.upload, error: action.msg, state: "error" } };
    case "UPLOAD_REQUEST":
      return { ...state, upload: { ...state.upload, error: null, state: "uploading" } };
    case "UPLOAD_SUCCESS":
      return { ...state, upload: { ...state.upload, error: null, state: "uploaded" } };
    case "UPLOAD_PROGRESS_UPDATE":
      return { ...state, upload: {
        ...state.upload,
        secondsLeft: action.secondsLeft,
        currentProgress: action.currentProgress,
      } };

    case "MARK_DOWNLOADED": return {
      ...state,
      recordings: state.recordings.map((recording, index) => (
        index === action.index ? { ...recording, downloaded: true } : recording
      )),
    };
    case "UPDATE_TITLE": return { ...state, title: action.value };
    case "UPDATE_PRESENTER": return { ...state, presenter: action.value };
    case "UPDATE_START": return { ...state, start: action.time };
    case "UPDATE_END": return { ...state, end: action.time };

    case "RESET": return initialState(state.hasWebcam);

    default: assertNever(action);
  }
};

export type Dispatcher = (action: ReducerAction) => void;

const stateContext = createContext<StudioState | null>(null);
const dispatchContext = createContext<Dispatcher | null>(null);

type ProviderProps = React.PropsWithChildren<{
  hasWebcam: boolean;
}>;

export const Provider: React.FC<ProviderProps> = ({ hasWebcam, children }) => {
  const [state, dispatch] = useReducer(reducer, initialState(hasWebcam));

  return (
    <dispatchContext.Provider value={dispatch}>
      <stateContext.Provider value={state}>{children}</stateContext.Provider>
    </dispatchContext.Provider>
  );
};

/** Hook to get the `dispatch` function in order to change the global studio state. */
export const useDispatch = (): Dispatcher => usePresentContext(dispatchContext, "useDispatch");

/** Hook to get access to the global Studio state. */
export const useStudioState = (): StudioState => usePresentContext(stateContext, "useStudioState");
