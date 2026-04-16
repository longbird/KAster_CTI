import { Card, Result } from 'antd';

interface Props {
  title: string;
  description?: string;
}

export function StubPage({ title, description }: Props) {
  return (
    <Card>
      <Result
        status="info"
        title={title}
        subTitle={description ?? '이 기능은 준비 중입니다.'}
      />
    </Card>
  );
}
