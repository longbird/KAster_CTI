import { Grid, Table } from 'antd';
import type { TableProps } from 'antd';
import type { ColumnType, ColumnsType } from 'antd/es/table';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

// 모바일에서 가로 스크롤 대신 행을 카드로 보여준다. 목록 화면들이
// scroll.x 880~1450px 에 관리 열을 오른쪽 고정으로 붙여 두는 탓에
// 좁은 화면에서는 정작 내용이 보이지 않는다.

export function flattenColumns<T>(columns: ColumnsType<T>): ColumnType<T>[] {
  return columns.flatMap((column) => {
    const children = (column as { children?: ColumnsType<T> }).children;
    return Array.isArray(children) ? flattenColumns(children) : [column as ColumnType<T>];
  });
}

type CellKey = string | number;

export function readCell<T>(column: ColumnType<T>, record: T, index: number): ReactNode {
  // antd 의 DataIndex<T> 는 유니온이 넓어 그대로 다루면 타입 추론이 폭주한다.
  const path = column.dataIndex as CellKey | readonly CellKey[] | undefined;
  const keys: readonly CellKey[] = path === undefined ? [] : Array.isArray(path) ? path : [path as CellKey];

  let raw: unknown = path === undefined ? undefined : record;
  for (const key of keys) {
    if (raw == null) break;
    raw = (raw as Record<CellKey, unknown>)[key];
  }

  const rendered = column.render ? column.render(raw, record, index) : (raw as ReactNode);

  // render 는 셀 병합용으로 { children, props } 를 돌려줄 수 있다.
  if (rendered && typeof rendered === 'object' && !isValidElement(rendered) && 'children' in rendered) {
    return (rendered as { children: ReactNode }).children;
  }
  return rendered as ReactNode;
}

function isEmptyCell(content: ReactNode): boolean {
  return content === null || content === undefined || content === '' || content === false;
}

function columnKey<T>(column: ColumnType<T>, index: number): string {
  if (column.key !== undefined) return String(column.key);
  if (column.dataIndex !== undefined) {
    return Array.isArray(column.dataIndex) ? column.dataIndex.join('.') : String(column.dataIndex);
  }
  return `col-${index}`;
}

interface MobileRowCardProps<T> {
  columns: ColumnsType<T>;
  record: T;
  index: number;
}

export function MobileRowCard<T>({ columns, record, index }: MobileRowCardProps<T>): ReactElement {
  const flat = flattenColumns(columns);
  const actionColumns = flat.filter((column) => column.fixed === 'right');
  const bodyColumns = flat.filter((column) => column.fixed !== 'right');
  const [titleColumn, ...fieldColumns] = bodyColumns;

  const title = titleColumn ? readCell(titleColumn, record, index) : undefined;
  const fields = fieldColumns
    .map((column, position) => ({
      key: columnKey(column, position),
      label: column.title as ReactNode,
      content: readCell(column, record, index),
    }))
    .filter((field) => !isEmptyCell(field.content));
  const actions = actionColumns
    .map((column, position) => ({ key: columnKey(column, position), content: readCell(column, record, index) }))
    .filter((action) => !isEmptyCell(action.content));

  return (
    <div className="mobile-row-card">
      {isEmptyCell(title) ? null : <div className="mobile-row-card__title">{title}</div>}
      {fields.length ? (
        <dl className="mobile-row-card__fields">
          {fields.map((field) => (
            <div className="mobile-row-card__field" key={field.key}>
              <dt className="mobile-row-card__label">{field.label}</dt>
              <dd className="mobile-row-card__value">{field.content}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions.length ? (
        <div className="mobile-row-card__actions">
          {actions.map((action) => (
            <div key={action.key}>{action.content}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ResponsiveTable<T extends object>(props: TableProps<T>): ReactElement {
  const screens = Grid.useBreakpoint();
  // md 가 undefined 인 구간(첫 렌더·SSR)은 데스크톱으로 둔다.
  const isMobile = screens.md === false;
  const columns = props.columns;

  if (!isMobile || !columns?.length) {
    return <Table<T> {...props} />;
  }

  return (
    <Table<T>
      {...props}
      showHeader={false}
      scroll={undefined}
      tableLayout={undefined}
      className={['responsive-table--cards', props.className].filter(Boolean).join(' ')}
      columns={[
        {
          key: '__mobile_card__',
          render: (_: unknown, record: T, index: number) => (
            <MobileRowCard columns={columns} record={record} index={index} />
          ),
        },
      ]}
    />
  );
}
