import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Tag, Typography } from 'antd';
import { NODE_TYPE_LABELS, TERMINAL_NODE_TYPES } from '../types/flowGraph';
import type { FlowCanvasNode } from '../types/canvasGraph';
import { describeNodeSummary } from '../types/nodeDefaults';

// 값은 styles.css 의 --ars-node-* 범주형 스케일에 있다. 헤더가 흰 글자를 얹은
// 단색 배경이라, 예전 값 중 몇은(큐·조건·종료 등) 흰 글자가 2:1 대로 안 읽혔다.
const TYPE_COLOR: Record<string, string> = {
  PLAY: 'var(--ars-node-play)',
  MENU: 'var(--ars-node-menu)',
  QUEUE: 'var(--ars-node-queue)',
  TRANSFER: 'var(--ars-node-transfer)',
  SMS: 'var(--ars-node-sms)',
  OPT_OUT: 'var(--ars-node-opt-out)',
  CONDITION: 'var(--ars-node-condition)',
  HANGUP: 'var(--ars-node-hangup)',
  COLLECT_DIGITS: 'var(--ars-node-collect-digits)',
  HTTP_LOOKUP: 'var(--ars-node-http-lookup)',
};

/**
 * 캔버스 위의 노드 한 장.
 *
 * 터미널 노드(큐·전환·종료)는 나가는 연결점을 두지 않는다 — 서버 컴파일러가
 * 그 지점에서 통화를 끝내므로, 이을 수 있게 보이면 거짓말이 된다.
 */
export function ArsFlowNodeCard({ data, selected }: NodeProps<FlowCanvasNode>) {
  const { row, isEntry } = data;
  const color = TYPE_COLOR[row.nodeType] ?? 'var(--ars-node-play)';
  const summary = describeNodeSummary(row.nodeType, row.config);
  const isTerminal = TERMINAL_NODE_TYPES.includes(row.nodeType);

  return (
    <div
      style={{
        minWidth: 180,
        maxWidth: 240,
        borderRadius: 8,
        border: `2px solid ${selected ? color : 'transparent'}`,
        boxShadow: '0 1px 4px rgba(0,0,0,.18)',
        background: 'var(--bg-1, #fff)',
        overflow: 'hidden',
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ background: color, color: '#fff', padding: '4px 10px', fontSize: 12, display: 'flex', gap: 6 }}>
        <span>{NODE_TYPE_LABELS[row.nodeType]}</span>
        {isEntry && <Tag color="warning" style={{ marginInlineEnd: 0, lineHeight: '16px' }}>진입</Tag>}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <Typography.Text strong ellipsis style={{ display: 'block' }}>{row.label}</Typography.Text>
        {summary && (
          <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: 12 }}>
            {summary}
          </Typography.Text>
        )}
      </div>
      {!isTerminal && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
