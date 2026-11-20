import { SegmentedToggle } from "@/client/components/SegmentedToggle";

/** A labelled single choice among a few short options. */
export function Choice<T extends string>({
  label,
  testId,
  options,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="text-sm font-medium">{label}</div>
      <SegmentedToggle
        showLabels
        value={value}
        onChange={onChange}
        items={options.map((option) => ({ ...option, icon: null }))}
      />
    </div>
  );
}

export const COUNT_OPTIONS = (["1", "2", "3", "4"] as const).map((value) => ({
  value,
  label: value,
}));
