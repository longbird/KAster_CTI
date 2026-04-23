import { describe, expect, it, vi } from 'vitest';
import type { DesktopAudioPreferences } from '../../../shared/ipc';
import { AudioDeviceController } from './audio-device-controller';

function createPreferences(overrides?: Partial<DesktopAudioPreferences>): DesktopAudioPreferences {
  return {
    inputDeviceId: null,
    outputDeviceId: null,
    ringDeviceId: null,
    echoCancellation: true,
    noiseSuppression: true,
    ...overrides,
  };
}

describe('AudioDeviceController', () => {
  it('선택한 마이크 장치를 getUserMedia exact constraint 로 요청한다', async () => {
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: vi.fn() }],
    }));
    const controller = new AudioDeviceController({
      mediaDevices: {
        getUserMedia,
      },
      createAudioElement: () => ({
        src: '',
        loop: false,
        currentTime: 0,
        play: vi.fn(async () => undefined),
        pause: vi.fn(),
      }),
    });

    await controller.requestInputAccess(
      createPreferences({
        inputDeviceId: 'mic-1',
        echoCancellation: false,
        noiseSuppression: true,
      }),
    );

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: 'mic-1' },
        echoCancellation: false,
        noiseSuppression: true,
      },
    });
  });

  it('선택한 스피커와 벨 출력 장치를 각각 sink id 에 반영한다', async () => {
    const outputAudio = {
      src: '',
      loop: false,
      currentTime: 0,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      setSinkId: vi.fn(async () => undefined),
    };
    const ringAudio = {
      src: '',
      loop: false,
      currentTime: 0,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      setSinkId: vi.fn(async () => undefined),
    };
    let created = 0;
    const controller = new AudioDeviceController({
      mediaDevices: {
        getUserMedia: vi.fn(),
      },
      createAudioElement: () => {
        created += 1;
        return created === 1 ? outputAudio : ringAudio;
      },
    });

    await controller.applyPreferences(
      createPreferences({
        outputDeviceId: 'speaker-1',
        ringDeviceId: 'ringer-1',
      }),
    );

    expect(outputAudio.setSinkId).toHaveBeenCalledWith('speaker-1');
    expect(ringAudio.setSinkId).toHaveBeenCalledWith('ringer-1');
    expect(controller.getCapabilities().sinkSelectionSupported).toBe(true);
  });
});
