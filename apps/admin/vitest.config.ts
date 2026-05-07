import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// JSX 사용 테스트가 'React is not defined' 로 깨지지 않도록
// react plugin 으로 자동 JSX 런타임을 적용한다. tsconfig.app.json 의
// jsx: "react-jsx" 설정과 동일한 변환을 vitest 에도 보장.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
