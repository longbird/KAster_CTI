import { USE_MOCK } from '../config';
import { connectMockSocket } from '../mock/mockSocket';
import { connectRealSocket } from './realSocket';
import type { CtiEvent } from '../types/cti';

export function connectSocket(onEvent: (event: CtiEvent) => void): () => void {
  return USE_MOCK ? connectMockSocket(onEvent) : connectRealSocket(onEvent);
}
