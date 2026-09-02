import { describe, expect, it } from 'vitest';
import { buildCategoryTree, type ConsultCategoryRow } from './consultCategory';

function row(overrides: Partial<ConsultCategoryRow> & Pick<ConsultCategoryRow, 'categoryId'>): ConsultCategoryRow {
  return {
    parentCategoryId: null,
    level: 1,
    code: 'CODE',
    name: '이름',
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildCategoryTree', () => {
  it('대-중-소를 3단계로 접는다', () => {
    const tree = buildCategoryTree([
      row({ categoryId: 'a', level: 1 }),
      row({ categoryId: 'b', level: 2, parentCategoryId: 'a' }),
      row({ categoryId: 'c', level: 3, parentCategoryId: 'b' }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].children?.[0].categoryId).toBe('b');
    expect(tree[0].children?.[0].children?.[0].categoryId).toBe('c');
  });

  it('형제는 목록 순서를 유지한다', () => {
    const tree = buildCategoryTree([
      row({ categoryId: 'a' }),
      row({ categoryId: 'b1', level: 2, parentCategoryId: 'a', sortOrder: 0 }),
      row({ categoryId: 'b2', level: 2, parentCategoryId: 'a', sortOrder: 1 }),
    ]);

    expect(tree[0].children?.map((child) => child.categoryId)).toEqual(['b1', 'b2']);
  });

  it('부모를 못 찾은 행도 최상위로 올려 보여준다', () => {
    const tree = buildCategoryTree([row({ categoryId: 'orphan', level: 2, parentCategoryId: 'gone' })]);

    expect(tree.map((node) => node.categoryId)).toEqual(['orphan']);
  });

  it('자식이 없으면 children 을 만들지 않는다', () => {
    const tree = buildCategoryTree([row({ categoryId: 'a' })]);

    expect(tree[0].children).toBeUndefined();
  });

  it('빈 목록은 빈 트리다', () => {
    expect(buildCategoryTree([])).toEqual([]);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const rows = [row({ categoryId: 'a' }), row({ categoryId: 'b', level: 2, parentCategoryId: 'a' })];

    buildCategoryTree(rows);

    expect(rows[0]).not.toHaveProperty('children');
  });
});
