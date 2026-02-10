import { useReducer, useCallback } from 'react'

export type BrainDumpPhase =
  | 'IDLE'
  | 'OPENING'
  | 'READY'
  | 'RECORDING'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'SPEAKING'
  | 'COMPLETING'
  | 'CLOSED'

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface BrainDumpState {
  phase: BrainDumpPhase
  transcript: TranscriptMessage[]
  error: string | null
  summary: string | null
}

type BrainDumpAction =
  | { type: 'OPEN' }
  | { type: 'READY' }
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'TRANSCRIPTION_DONE'; text: string }
  | { type: 'THINKING' }
  | { type: 'AI_RESPONSE'; text: string }
  | { type: 'START_SPEAKING' }
  | { type: 'DONE_SPEAKING' }
  | { type: 'START_COMPLETING' }
  | { type: 'COMPLETE_DONE'; summary: string | null }
  | { type: 'ERROR'; error: string }
  | { type: 'CLOSE' }
  | { type: 'RESET' }

const initialState: BrainDumpState = {
  phase: 'IDLE',
  transcript: [],
  error: null,
  summary: null,
}

function reducer(state: BrainDumpState, action: BrainDumpAction): BrainDumpState {
  switch (action.type) {
    case 'OPEN':
      return { ...state, phase: 'OPENING', error: null }
    case 'READY':
      return { ...state, phase: 'READY', error: null }
    case 'START_RECORDING':
      return { ...state, phase: 'RECORDING', error: null }
    case 'STOP_RECORDING':
      return { ...state, phase: 'TRANSCRIBING' }
    case 'TRANSCRIPTION_DONE':
      return {
        ...state,
        phase: 'THINKING',
        transcript: [
          ...state.transcript,
          { role: 'user', content: action.text, timestamp: new Date().toISOString() },
        ],
      }
    case 'THINKING':
      return { ...state, phase: 'THINKING' }
    case 'AI_RESPONSE':
      return {
        ...state,
        transcript: [
          ...state.transcript,
          { role: 'assistant', content: action.text, timestamp: new Date().toISOString() },
        ],
      }
    case 'START_SPEAKING':
      return { ...state, phase: 'SPEAKING' }
    case 'DONE_SPEAKING':
      return { ...state, phase: 'READY' }
    case 'START_COMPLETING':
      return { ...state, phase: 'COMPLETING' }
    case 'COMPLETE_DONE':
      return { ...state, phase: 'CLOSED', summary: action.summary }
    case 'ERROR':
      return { ...state, phase: 'READY', error: action.error }
    case 'CLOSE':
      return { ...state, phase: 'CLOSED' }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

export function useBrainDumpReducer() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const open = useCallback(() => dispatch({ type: 'OPEN' }), [])
  const ready = useCallback(() => dispatch({ type: 'READY' }), [])
  const startRecording = useCallback(() => dispatch({ type: 'START_RECORDING' }), [])
  const stopRecording = useCallback(() => dispatch({ type: 'STOP_RECORDING' }), [])
  const transcriptionDone = useCallback((text: string) => dispatch({ type: 'TRANSCRIPTION_DONE', text }), [])
  const thinking = useCallback(() => dispatch({ type: 'THINKING' }), [])
  const aiResponse = useCallback((text: string) => dispatch({ type: 'AI_RESPONSE', text }), [])
  const startSpeaking = useCallback(() => dispatch({ type: 'START_SPEAKING' }), [])
  const doneSpeaking = useCallback(() => dispatch({ type: 'DONE_SPEAKING' }), [])
  const startCompleting = useCallback(() => dispatch({ type: 'START_COMPLETING' }), [])
  const completeDone = useCallback((summary: string | null) => dispatch({ type: 'COMPLETE_DONE', summary }), [])
  const error = useCallback((msg: string) => dispatch({ type: 'ERROR', error: msg }), [])
  const close = useCallback(() => dispatch({ type: 'CLOSE' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  return {
    state,
    actions: {
      open,
      ready,
      startRecording,
      stopRecording,
      transcriptionDone,
      thinking,
      aiResponse,
      startSpeaking,
      doneSpeaking,
      startCompleting,
      completeDone,
      error,
      close,
      reset,
    },
  }
}
