export interface ConsultCategoryRow {
  categoryId: string;
  parentCategoryId: string | null;
  level: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConsultCategoryInput {
  code: string;
  name: string;
  parentCategoryId?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateConsultCategoryInput {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export const CATEGORY_LEVEL_LABELS: Record<number, string> = {
  1: '대분류',
  2: '중분류',
  3: '소분류',
};

export const MAX_CATEGORY_LEVEL = 3;

export interface ConsultCategoryTreeRow extends ConsultCategoryRow {
  children?: ConsultCategoryTreeRow[];
}

/** 평평한 목록을 대-중-소 트리로 접는다. 부모를 못 찾은 행은 최상위로 올려 화면에서 사라지지 않게 한다. */
export function buildCategoryTree(rows: ConsultCategoryRow[]): ConsultCategoryTreeRow[] {
  const nodes = new Map<string, ConsultCategoryTreeRow>(
    rows.map((row) => [row.categoryId, { ...row }]),
  );
  const roots: ConsultCategoryTreeRow[] = [];

  for (const row of rows) {
    const node = nodes.get(row.categoryId);
    if (!node) continue;

    const parent = row.parentCategoryId ? nodes.get(row.parentCategoryId) : undefined;
    if (parent) {
      parent.children = [...(parent.children ?? []), node];
    } else {
      roots.push(node);
    }
  }

  return roots;
}
