import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Tag, Typography } from 'antd';
import { NODE_TYPE_LABELS, TERMINAL_NODE_TYPES } from '../types/flowGraph';
import type { FlowCanvasNode } from '../types/canvasGraph';
import { describeNodeSummary } from '../types/nodeDefaults';

const TYPE_COLOR: Record<string, string> = {
  PLAY: '#1677ff',
  MENU: '#722ed1',
  QUEUE: '#52c41a',
  TRANSFER: '#13c2c2',
  SMS: '#fa8c16',
  OPT_OUT: '#eb2f96',
  CONDITION: '#faad14',
  HANGUP: '#8c8c8c',
  COLLECT_DIGITS: '#2f54eb',
  HTTP_LOOKUP: '#c41d7f',
};

/**
 * 캔버스 위의 노드 한 장.
 *
 * 터미널 노드(큐·전환·종료)는 나가는 연결점을 두지 않는다 — 서버 컴파일러가
 * 그 지점에서 통화를 끝내므로, 이을 수 있게 보이면 거짓말이 된다.
 */
export function ArsFlowNodeCard({ data, selected }: NodeProps<FlowCanvasNode>) {
  const { row, isEntry } = data;
  const color = TYPE_COLOR[row.nodeType] ?? '#1677ff';
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
        {isEntry && <Tag color="gold" style={{ marginInlineEnd: 0, lineHeight: '16px' }}>진입</Tag>}
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
