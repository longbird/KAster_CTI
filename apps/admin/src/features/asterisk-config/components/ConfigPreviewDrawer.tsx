import { Drawer, Spin, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { getPreview } from '../api/asteriskConfigApi';
import type { ConfPreview } from '../types/asterisk-config';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ConfigPreviewDrawer({ open, onClose }: Props) {
  const [preview, setPreview] = useState<ConfPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getPreview()
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
  }, [open]);

  const items = preview
    ? [
        { key: 'pjsip', label: 'pjsip.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.pjsip}</SyntaxHighlighter> },
        { key: 'inbound', label: 'extensions_inbound.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.extensionsInbound}</SyntaxHighlighter> },
        { key: 'queue', label: 'extensions_queue.conf', children: <SyntaxHighlighter language="ini" style={vs}>{preview.extensionsQueue}</SyntaxHighlighter> },
      ]
    : [];

  return (
    <Drawer title=".conf 미리보기" open={open} onClose={onClose} width={700}>
      <Spin spinning={loading}>
        {preview && <Tabs items={items} />}
        {!loading && !preview && <span style={{ color: '#888' }}>미리보기를 불러올 수 없습니다</span>}
      </Spin>
    </Drawer>
  );
}
