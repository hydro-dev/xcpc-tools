export const CAMERA_EVENT = 'quickConfigCamera';
export const CAMERA_LEASE_MS = 6000;

export interface CameraMessage {
    session: string;
    type: 'ready' | 'active' | 'result' | 'accepted' | 'rejected' | 'stop' | 'stopped' | 'error';
    text?: string;
    message?: string;
}
