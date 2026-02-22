/**
 * WebSocket message types exchanged between server and client.
 */

import type { VisualizerEvent } from './events';

// ---------------------------------------------------------------------------
// Server → Client messages
// ---------------------------------------------------------------------------

export interface ServerEventMessage {
  type: 'event';
  data: VisualizerEvent;
}

export interface ServerHistoryMessage {
  type: 'history';
  data: VisualizerEvent[];
}

export interface ServerConnectedMessage {
  type: 'connected';
  sessionId: string;
}

export type ServerMessage =
  | ServerEventMessage
  | ServerHistoryMessage
  | ServerConnectedMessage;

// ---------------------------------------------------------------------------
// Client → Server messages
// ---------------------------------------------------------------------------

export interface ClientSubscribeMessage {
  type: 'subscribe';
  sessionId?: string;
}

export interface ClientReplayMessage {
  type: 'replay';
  fromTimestamp: string;
}

export type ClientMessage =
  | ClientSubscribeMessage
  | ClientReplayMessage;
