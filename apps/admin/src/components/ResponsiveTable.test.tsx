import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ColumnsType } from 'antd/es/table';

import { flattenColumns, MobileRowCard, readCell, ResponsiveTable } from './ResponsiveTable';

interface Row {
  id: string;
  name: string;
  extension: string;
  memo?: string | null;
  nested: { code: string };
}

const row: Row = { id: 'a1', name: '홍길동', extension: '1001', memo: null, nested: { code: 'X9' } };

const columns: ColumnsType<Row> = [
  { title: '이름', dataIndex: 'name', width: 140 },
  { title: '내선', dataIndex: 'extension', width: 100 },
  { title: '코드', dataIndex: ['nested', 'code'], width: 100 },
  { title: '메모', dataIndex: 'memo', width: 120 },
  {
    title: '관리',
    width: 200,
    fixed: 'right',
    render: () => <button type="button">수정</button>,
  },
];

describe('flattenColumns', () => {
  it('그룹 컬럼을 한 줄로 펼친다', () => {
    const grouped: ColumnsType<Row> = [
      { title: '기본', children: [{ title: '이름', dataIndex: 'name' }, { title: '내선', dataIndex: 'extension' }] },
      { title: '코드', dataIndex: ['nested', 'code'] },
    ];
    expect(flattenColumns(grouped).map((c) => c.title)).toEqual(['이름', '내선', '코드']);
  });
});

describe('readCell', () => {
  it('배열 dataIndex 를 따라 값을 읽는다', () => {
    expect(readCell<Row>({ dataIndex: ['nested', 'code'] }, row, 0)).toBe('X9');
  });

  it('render 가 있으면 render 결과를 쓴다', () => {
    expect(readCell<Row>({ dataIndex: 'name', render: (v: string) => `<${v}>` }, row, 0)).toBe('<홍길동>');
  });

  it('셀 병합 객체는 children 을 꺼낸다', () => {
    expect(readCell<Row>({ dataIndex: 'name', render: () => ({ children: '병합', props: {} }) }, row, 0)).toBe('병합');
  });
});

describe('MobileRowCard', () => {
  const html = renderToStaticMarkup(<MobileRowCard columns={columns} record={row} index={0} />);

  it('첫 컬럼을 카드 제목으로 올린다', () => {
    expect(html).toContain('mobile-row-card__title');
    expect(html).toContain('홍길동');
  });

  it('나머지 컬럼을 라벨과 값으로 보여준다', () => {
    expect(html).toContain('내선');
    expect(html).toContain('1001');
    expect(html).toContain('코드');
    expect(html).toContain('X9');
  });

  it('값이 비어 있는 컬럼은 건너뛴다', () => {
    expect(html).not.toContain('메모');
  });

  it('오른쪽 고정 컬럼은 라벨 없이 액션 영역에 넣는다', () => {
    expect(html).toContain('mobile-row-card__actions');
    expect(html).toContain('수정');
    const labels = html.match(/mobile-row-card__label/g) ?? [];
    expect(html.slice(html.indexOf('mobile-row-card__actions'))).not.toContain('mobile-row-card__label');
    expect(labels.length).toBe(2);
  });
});

describe('ResponsiveTable', () => {
  it('데스크톱(브레이크포인트 미확정)에서는 원래 표를 그대로 그린다', () => {
    const html = renderToStaticMarkup(
      <ResponsiveTable<Row> rowKey="id" columns={columns} dataSource={[row]} pagination={false} />,
    );
    expect(html).toContain('이름');
    expect(html).toContain('내선');
    expect(html).not.toContain('mobile-row-card');
  });
});
