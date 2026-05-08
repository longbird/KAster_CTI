import { Button, Checkbox, Select, Space, Tooltip, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  src: string;
  autoPlay?: boolean;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function RecordingPlayer({ src, autoPlay = true }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      if (loopEnabled && loopStart != null && loopEnd != null && loopEnd > loopStart) {
        if (audio.currentTime >= loopEnd) {
          audio.currentTime = loopStart;
        }
      }
    };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
    };
  }, [loopEnabled, loopStart, loopEnd]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = clamp(audio.currentTime + delta, 0, audio.duration || 0);
  }, []);

  const adjustVolume = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = clamp(audio.volume + delta, 0, 1);
  }, []);

  const adjustRate = useCallback((delta: number) => {
    setRate((prev) => {
      const next = clamp(Math.round((prev + delta) * 100) / 100, 0.25, 4);
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!containerRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (!containerRef.current.contains(document.activeElement) && document.activeElement !== document.body) {
        return;
      }
      switch (event.code) {
        case 'Space':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          seekBy(-5);
          break;
        case 'ArrowRight':
          event.preventDefault();
          seekBy(5);
          break;
        case 'ArrowUp':
          event.preventDefault();
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'BracketLeft':
          event.preventDefault();
          adjustRate(-0.25);
          break;
        case 'BracketRight':
          event.preventDefault();
          adjustRate(0.25);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, seekBy, adjustVolume, adjustRate]);

  const setLoopAFromCurrent = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setLoopStart(audio.currentTime);
  };
  const setLoopBFromCurrent = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setLoopEnd(audio.currentTime);
  };
  const clearLoop = () => {
    setLoopStart(null);
    setLoopEnd(null);
    setLoopEnabled(false);
  };

  const loopStatus = useMemo(() => {
    if (loopStart == null && loopEnd == null) return '구간 미설정';
    return `${loopStart != null ? formatTime(loopStart) : '--:--'} ~ ${loopEnd != null ? formatTime(loopEnd) : '--:--'}`;
  }, [loopStart, loopEnd]);

  return (
    <div ref={containerRef} tabIndex={-1} style={{ outline: 'none' }}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <audio
          ref={audioRef}
          src={src}
          autoPlay={autoPlay}
          controls
          style={{ width: '100%' }}
        >
          브라우저가 오디오 재생을 지원하지 않습니다.
        </audio>

        <Space wrap size="small">
          <Typography.Text type="secondary">배속</Typography.Text>
          <Select
            size="small"
            value={rate}
            style={{ width: 90 }}
            onChange={(value) => setRate(value)}
            options={PLAYBACK_RATES.map((r) => ({ value: r, label: `${r}x` }))}
          />
          <Tooltip title="구간 시작 (현재 시각)">
            <Button size="small" onClick={setLoopAFromCurrent}>
              A 지정
            </Button>
          </Tooltip>
          <Tooltip title="구간 끝 (현재 시각)">
            <Button size="small" onClick={setLoopBFromCurrent}>
              B 지정
            </Button>
          </Tooltip>
          <Checkbox
            checked={loopEnabled}
            disabled={loopStart == null || loopEnd == null || (loopEnd ?? 0) <= (loopStart ?? 0)}
            onChange={(e) => setLoopEnabled(e.target.checked)}
          >
            구간반복
          </Checkbox>
          <Button size="small" onClick={clearLoop} disabled={loopStart == null && loopEnd == null}>
            구간 해제
          </Button>
          <Typography.Text type="secondary">{loopStatus}</Typography.Text>
          <Typography.Text type="secondary">
            {formatTime(currentTime)} / {formatTime(duration)}
          </Typography.Text>
        </Space>

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          단축키: Space 재생/일시정지 · ←/→ 5초 · ↑/↓ 볼륨 · [ / ] 배속 ±0.25
        </Typography.Text>
      </Space>
    </div>
  );
}
