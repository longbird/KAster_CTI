import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoftphoneMediaController } from './softphone-media-controller';

describe('SoftphoneMediaController', () => {
  let audioElement: {
    srcObject: MediaStream | null;
    autoplay: boolean;
    currentTime: number;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    setSinkId: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    audioElement = {
      srcObject: null,
      autoplay: false,
      currentTime: 0,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      setSinkId: vi.fn(async () => undefined),
    };
  });

  it('attachRemoteStream 은 srcObject 를 바꾸고 재생을 시작한다', async () => {
    const controller = new SoftphoneMediaController({
      createAudioElement: () => audioElement,
    });
    const stream = { id: 'remote-stream' } as unknown as MediaStream;

    await controller.attachRemoteStream(stream);

    expect(audioElement.srcObject).toBe(stream);
    expect(audioElement.play).toHaveBeenCalled();
  });

  it('같은 remote stream 을 반복 attach 해도 srcObject 를 다시 load 하지 않는다', async () => {
    const controller = new SoftphoneMediaController({
      createAudioElement: () => audioElement,
    });
    const stream = { id: 'remote-stream' } as unknown as MediaStream;

    await controller.attachRemoteStream(stream);
    audioElement.currentTime = 12;
    await controller.attachRemoteStream(stream);

    expect(audioElement.srcObject).toBe(stream);
    expect(audioElement.currentTime).toBe(12);
    expect(audioElement.play).toHaveBeenCalledTimes(2);
  });

  it('새 load 로 중단된 play 요청은 재생 실패로 전파하지 않는다', async () => {
    const controller = new SoftphoneMediaController({
      createAudioElement: () => audioElement,
    });
    const stream = { id: 'remote-stream' } as unknown as MediaStream;
    audioElement.play.mockRejectedValueOnce(new DOMException('The play() request was interrupted by a new load request.', 'AbortError'));

    await expect(controller.attachRemoteStream(stream)).resolves.toBeUndefined();
  });

  it('applyOutputDevice 는 setSinkId 를 지원하면 sink id 를 적용한다', async () => {
    const controller = new SoftphoneMediaController({
      createAudioElement: () => audioElement,
    });

    await controller.applyOutputDevice('speaker-1');

    expect(audioElement.setSinkId).toHaveBeenCalledWith('speaker-1');
  });

  it('startRingtone 은 loop 로 벨소리를 재생하고 stopRingtone 은 이를 멈춘다', async () => {
    const ringAudio = {
      srcObject: null as MediaStream | null,
      autoplay: false,
      currentTime: 0,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      setSinkId: vi.fn(async () => undefined),
      loop: false,
      src: '',
    };
    let index = 0;
    const controller = new SoftphoneMediaController({
      createAudioElement: () => (index++ === 0 ? audioElement : ringAudio),
    });

    await controller.startRingtone();
    controller.stopRingtone();

    expect(ringAudio.loop).toBe(true);
    expect(ringAudio.volume).toBe(0.35);
    expect(ringAudio.play).toHaveBeenCalled();
    expect(ringAudio.pause).toHaveBeenCalled();
  });

  it('applyRingDevice 는 벨소리 출력 장치를 따로 적용한다', async () => {
    const ringAudio = {
      srcObject: null as MediaStream | null,
      autoplay: false,
      currentTime: 0,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      setSinkId: vi.fn(async () => undefined),
      loop: false,
      src: '',
    };
    let index = 0;
    const controller = new SoftphoneMediaController({
      createAudioElement: () => (index++ === 0 ? audioElement : ringAudio),
    });

    await controller.applyRingDevice('ringer-1');

    expect(ringAudio.setSinkId).toHaveBeenCalledWith('ringer-1');
  });

  it('detachRemoteStream 은 재생을 멈추고 srcObject 를 비운다', async () => {
    const controller = new SoftphoneMediaController({
      createAudioElement: () => audioElement,
    });
    audioElement.srcObject = { id: 'remote-stream' } as unknown as MediaStream;

    controller.detachRemoteStream();

    expect(audioElement.pause).toHaveBeenCalled();
    expect(audioElement.srcObject).toBeNull();
  });
});
