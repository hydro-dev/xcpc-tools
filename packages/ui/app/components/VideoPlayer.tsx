import { Stack, Text } from '@mantine/core';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import React from 'react';

interface VideoPlayerProps {
  client: { ip: string; camera?: string; desktop?: string };
  type?: 'camera' | 'desktop';
}

export function resolveStreamUrl(ip: string, stream = '') {
  const value = stream.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('proxy://')) return `/stream/${ip}${value.substring(8)}`;
  return `http://${ip}${value}`;
}

export default function VideoPlayer({ client, type = 'camera' }: VideoPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [error, setError] = React.useState('');
  const src = resolveStreamUrl(client.ip, client[type]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let hls: Hls | undefined;
    let ts: mpegts.Player | undefined;
    setError('');
    const onError = () => setError('Unable to play this stream.');
    video.addEventListener('error', onError);

    try {
      if (!src) {
        setError('No stream URL configured.');
      } else if (/\.m3u8$/i.test(new URL(src, window.location.href).pathname)) {
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            setError(`Unable to play the HLS stream (${data.details}).`);
            hls?.destroy();
            hls = undefined;
          });
          hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(src));
          hls.attachMedia(video);
        } else {
          setError('This browser does not support playback with hls.js. Please use a compatible browser.');
        }
      } else if (mpegts.isSupported()) {
        ts = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: src });
        ts.on(mpegts.Events.ERROR, onError);
        ts.attachMediaElement(video);
        ts.load();
      } else {
        setError('This browser does not support MPEG-TS playback.');
      }
    } catch {
      onError();
    }

    return () => {
      video.removeEventListener('error', onError);
      hls?.destroy();
      ts?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  return (
    <Stack gap="xs" mt="md">
      {/* Live camera and desktop streams do not provide a captions track. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} autoPlay muted playsInline controls style={{ width: '100%' }} />
      {error && <Text c="red" size="sm" role="alert">{error}</Text>}
    </Stack>
  );
}
