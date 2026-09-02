import { Alert, Divider, Space, Tag, Typography } from 'antd';
import type { HelpResolution } from './featureHelp';
import type { FeatureHelpEntry } from './types';

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <Typography.Text strong>{title}</Typography.Text>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {items.map((item, index) => (
          <li key={index}>
            <Typography.Text>{item}</Typography.Text>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadyBody({ entry }: { entry: FeatureHelpEntry }) {
  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <div>
        <Space align="center">
          <Typography.Title level={5} style={{ margin: 0 }}>
            {entry.title}
          </Typography.Title>
          <Tag color={entry.reviewStatus === 'APPROVED' ? 'success' : 'warning'}>
            {entry.reviewStatus === 'APPROVED' ? '검토 완료' : '검토 대기'}
          </Tag>
        </Space>
        <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
          {entry.summary}
        </Typography.Paragraph>
      </div>
      <Section title="설정 방법" items={entry.howTo} />
      <Section title="운영 예시" items={entry.examples} />
      <Section title="주의사항" items={entry.warnings} />
      {entry.relatedRoutes.length > 0 && (
        <div>
          <Typography.Text strong>관련 설정</Typography.Text>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {entry.relatedRoutes.map((route) => (
              <li key={route.route}>
                <Typography.Link href={route.route} target="_blank" rel="noreferrer">
                  {route.label}
                </Typography.Link>{' '}
                <Typography.Text type="secondary">({route.route})</Typography.Text>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Divider style={{ margin: '4px 0' }} />
      <div>
        <Typography.Text strong>출처</Typography.Text>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {entry.sources.map((source, index) => (
            <li key={index}>
              <Typography.Text type="secondary">
                [{source.kind}] {source.ref}
                {source.retrievedAt ? ` (검색일 ${source.retrievedAt})` : ''}
              </Typography.Text>
            </li>
          ))}
        </ul>
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        마지막 갱신일: {entry.updatedAt}
      </Typography.Text>
    </Space>
  );
}

export function FeatureHelpPanelBody({ resolution }: { resolution: HelpResolution }) {
  if (resolution.status === 'ready' && resolution.entry) {
    return <ReadyBody entry={resolution.entry} />;
  }
  if (resolution.status === 'draft-pending') {
    return (
      <Alert
        type="warning"
        showIcon
        message="도움말 검토 대기"
        description="이 기능의 도움말은 자동 생성 후 검토 대기 상태입니다. 관리자 검토 후 표시됩니다."
      />
    );
  }
  return (
    <Alert
      type="info"
      showIcon
      message="도움말 준비 중"
      description="이 기능의 도움말이 아직 등록되지 않았습니다. 도움말 구축이 필요합니다."
    />
  );
}
