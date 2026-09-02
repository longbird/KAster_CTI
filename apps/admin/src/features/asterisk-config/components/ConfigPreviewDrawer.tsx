import { Drawer, Spin, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { getConfigDiff, getPreview } from '../api/asteriskConfigApi';
import type { ConfigDiffResponse } from '../apply/applyGate';
import type { ConfPreview } from '../types/asterisk-config';
import { ConfigDiffPanel } from './ConfigDiffPanel';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 변경 내역을 실제로 받아 보여줬을 때 부모에게 알린다. 적용 버튼은 이걸 본 뒤에만 열린다. */
  onDiffLoaded?: (diff: ConfigDiffResponse | null) => void;
}

export function ConfigPreviewDrawer({ open, onClose, onDiffLoaded }: Props) {
  const [preview, setPreview] = useState<ConfPreview | null>(null);
  const [diff, setDiff] = useState<ConfigDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    // 두 요청 모두 같은 렌더 결과를 근거로 하므로 함께 받아 화면이 어긋나지 않게 한다.
    Promise.allSettled([getPreview(), getConfigDiff()])
      .then(([previewResult, diffResult]) => {
        setPreview(previewResult.status === 'fulfilled' ? previewResult.value : null);
        const loadedDiff = diffResult.status === 'fulfilled' ? diffResult.value : null;
        setDiff(loadedDiff);
        onDiffLoaded?.(loadedDiff);
      })
      .finally(() => setLoading(false));
  }, [open, onDiffLoaded]);

  const confTab = (label: string, content: string | undefined) => (
    <SyntaxHighlighter language="ini" style={vs}>{content ?? ''}</SyntaxHighlighter>
  );

  const items = [
    {
      key: 'diff',
      label: '변경 내역',
      children: <ConfigDiffPanel diff={diff?.diff ?? null} validation={diff?.validation ?? null} />,
    },
    ...(preview
      ? [
          { key: 'pjsip', label: 'pjsip.conf', children: confTab('pjsip', preview.pjsip) },
          { key: 'inbound', label: 'extensions_inbound.conf', children: confTab('inbound', preview.extensionsInbound) },
          { key: 'queue', label: 'extensions_queue.conf', children: confTab('queue', preview.extensionsQueue) },
        ]
      : []),
  ];

  return (
    <Drawer title="PBX 설정 미리보기" open={open} onClose={onClose} width={780}>
      <Spin spinning={loading}>
        <Tabs items={items} />
        {!loading && !preview && !diff && (
          <span style={{ color: '#888' }}>미리보기를 불러올 수 없습니다</span>
        )}
      </Spin>
    </Drawer>
  );
}
