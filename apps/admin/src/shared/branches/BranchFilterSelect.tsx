import { Select } from 'antd';
import { useBranchOptions } from './useBranchOptions';

interface Props {
  value?: string;
  onChange: (value: string | undefined) => void;
  width?: number;
}

export function BranchFilterSelect({ value, onChange, width = 220 }: Props) {
  const { options, loading } = useBranchOptions();

  return (
    <Select
      allowClear
      loading={loading}
      placeholder="지사 전체"
      value={value}
      onChange={(next) => onChange(next)}
      style={{ width }}
      options={options.map((branch) => ({
        value: branch.branchId,
        label: `${branch.branchName} (${branch.branchCode})`,
      }))}
    />
  );
}
