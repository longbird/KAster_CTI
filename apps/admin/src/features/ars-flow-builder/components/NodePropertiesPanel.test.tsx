import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NodePropertiesPanel } from './NodePropertiesPanel';
import type { FlowNodeRow } from '../types/flowGraph';

const menu: FlowNodeRow = {
  nodeId: 'menu', nodeType: 'MENU', label: '메뉴',
  config: { promptKey: null, timeoutSeconds: 5, maxRetries: 2 }, posX: 0, posY: 0,
};
const queue: FlowNodeRow = {
  nodeId: 'q1', nodeType: 'QUEUE', label: '큐 연결', config: { queueName: 'sales' }, posX: 0, posY: 0,
};

function render(props: Partial<Parameters<typeof NodePropertiesPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <NodePropertiesPanel
      node={menu} httpEndpoints={[]} isEntry={false} outgoing={[]} incoming={[]}
      onChange={() => {}} onSetEntry={() => {}} onDelete={() => {}}
      onEdgeDigitChange={() => {}} onEdgeDelete={() => {}}
      {...props}
    />,
  );
}

describe('NodePropertiesPanel 연결 편집', () => {
  /**
   * 연결 목록이 노드 폼 아래에 그냥 이어지면, 연결이 둘만 돼도 두 번째 줄이
   * 패널 밖으로 밀려 안 보인다. 스크롤해야 나오는 것을 사용자는 없는 것으로 읽는다.
   */
  it('연결 목록을 패널 바닥에 고정한다', () => {
    const html = render({ outgoing: [{ edgeId: 'e1', condition: 'DIGIT', digit: '1', toLabel: '큐' }] });
    expect(html).toContain('ars-builder__links');
  });

  it('나가는 디지트 연결마다 입력칸을 준다', () => {
    const html = render({
      outgoing: [
        { edgeId: 'e1', condition: 'DIGIT', digit: '1', toLabel: '영업' },
        { edgeId: 'e2', condition: 'DIGIT', digit: '2', toLabel: '기술' },
      ],
    });
    expect(html.match(/value="1"/g)?.length).toBe(1);
    expect(html.match(/value="2"/g)?.length).toBe(1);
  });

  /**
   * 디지트를 고치러 사용자는 눌러서 가는 노드를 클릭한다 — 메뉴 노드가 아니라.
   * 대상 노드에서도 같은 값을 고칠 수 있어야 한다.
   */
  it('들어오는 디지트 연결도 대상 노드에서 고칠 수 있다', () => {
    const html = render({
      node: queue,
      incoming: [{ edgeId: 'e1', condition: 'DIGIT', digit: '7', fromLabel: '메뉴' }],
    });
    expect(html).toContain('들어오는 연결');
    expect(html).toContain('value="7"');
  });
});
