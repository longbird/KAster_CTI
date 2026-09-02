/** @type {import('tailwindcss').Config} */
const colorToken = (tokenName) => `rgb(var(${tokenName}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // "The Precision Curator" 디자인 시스템 팔레트
      colors: {
        'tertiary-fixed': colorToken('--color-tertiary-fixed'),
        'surface-container-low': colorToken('--color-surface-container-low'),
        'on-surface-variant': colorToken('--color-on-surface-variant'),
        'surface-dim': colorToken('--color-surface-dim'),
        'on-secondary': colorToken('--color-on-secondary'),
        'secondary-container': colorToken('--color-secondary-container'),
        'on-tertiary-container': colorToken('--color-on-tertiary-container'),
        'secondary-fixed': colorToken('--color-secondary-fixed'),
        'error': colorToken('--color-error'),
        'surface-tint': colorToken('--color-surface-tint'),
        'inverse-surface': colorToken('--color-inverse-surface'),
        'surface-variant': colorToken('--color-surface-variant'),
        'primary-fixed-dim': colorToken('--color-primary-fixed-dim'),
        'on-error': colorToken('--color-on-error'),
        'on-tertiary': colorToken('--color-on-tertiary'),
        'surface-container-high': colorToken('--color-surface-container-high'),
        'on-error-container': colorToken('--color-on-error-container'),
        'surface-container': colorToken('--color-surface-container'),
        'surface-bright': colorToken('--color-surface-bright'),
        'on-primary-fixed': colorToken('--color-on-primary-fixed'),
        'primary-fixed': colorToken('--color-primary-fixed'),
        'on-primary': colorToken('--color-on-primary'),
        'on-tertiary-fixed-variant': colorToken('--color-on-tertiary-fixed-variant'),
        'background': colorToken('--color-background'),
        'tertiary': colorToken('--color-tertiary'),
        'surface-container-lowest': colorToken('--color-surface-container-lowest'),
        'primary': colorToken('--color-primary'),
        'outline-variant': colorToken('--color-outline-variant'),
        'on-primary-fixed-variant': colorToken('--color-on-primary-fixed-variant'),
        'secondary-fixed-dim': colorToken('--color-secondary-fixed-dim'),
        'on-secondary-fixed': colorToken('--color-on-secondary-fixed'),
        'error-container': colorToken('--color-error-container'),
        'on-primary-container': colorToken('--color-on-primary-container'),
        'on-background': colorToken('--color-on-background'),
        'inverse-primary': colorToken('--color-inverse-primary'),
        'primary-container': colorToken('--color-primary-container'),
        'tertiary-container': colorToken('--color-tertiary-container'),
        'tertiary-fixed-dim': colorToken('--color-tertiary-fixed-dim'),
        'surface-container-highest': colorToken('--color-surface-container-highest'),
        'on-surface': colorToken('--color-on-surface'),
        'surface': colorToken('--color-surface'),
        'inverse-on-surface': colorToken('--color-inverse-on-surface'),
        'outline': colorToken('--color-outline'),
        'secondary': colorToken('--color-secondary'),
        'on-secondary-fixed-variant': colorToken('--color-on-secondary-fixed-variant'),
        'on-tertiary-fixed': colorToken('--color-on-tertiary-fixed'),
        'on-secondary-container': colorToken('--color-on-secondary-container'),
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
      // Tailwind 기본 스케일(12 · 14 · 16 · 20)에 없는 두 단계만 이름을 준다.
      // 예전에는 text-[9px] ~ text-[20px] 여덟 가지가 임의값으로 흩어져 있었다.
      fontSize: {
        micro: ['10px', { lineHeight: '1.3' }],
        caption: ['11px', { lineHeight: '1.35' }],
      },
      fontFamily: {
        headline: ['Manrope', 'system-ui', 'sans-serif'],
        body: ['Inter', 'Pretendard', 'Noto Sans KR', 'system-ui', 'sans-serif'],
        label: ['Inter', 'Pretendard', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // "Soft-Focus" ambient shadow — 프로 느낌의 확산광
        panel: '0 20px 40px rgba(25, 28, 29, 0.06)',
        // 플로팅 요소용 약간 더 진한 버전
        float: '0 24px 48px rgba(25, 28, 29, 0.12)',
      },
      backgroundImage: {
        // CTA 그라디언트 — primary → primary-container 135deg
        'primary-gradient': 'linear-gradient(135deg, #003fb1 0%, #1a56db 100%)',
      },
    },
  },
  plugins: [],
};
