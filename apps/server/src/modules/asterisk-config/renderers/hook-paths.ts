/**
 * Asterisk 가 `System()` 으로 부르는 훅 경로.
 *
 * dialplan 렌더러와 ARS 플로우 컴파일러가 **같은 훅**을 부른다.
 * 두 곳에 문자열을 복제하면 한쪽만 고쳐졌을 때 조용히 어긋난다.
 */
export const CUSTOM_SOUND_ABSOLUTE_PREFIX = '/var/lib/asterisk/sounds/custom/';
export const OPT_OUT_HOOK_PATH = `${CUSTOM_SOUND_ABSOLUTE_PREFIX}kaster-opt-out-hook.sh`;
export const SMART_ARS_HOOK_PATH = `${CUSTOM_SOUND_ABSOLUTE_PREFIX}kaster-smart-ars-hook.sh`;
