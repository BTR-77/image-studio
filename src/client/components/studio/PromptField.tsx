import { Textarea } from "@/client/components/ui/textarea";
import { PROMPT_MAX } from "@/shared/options";

/** A prompt box with its live character count. */
export function PromptField({
  id,
  label,
  value,
  onChange,
  placeholder,
  testId,
  action,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Textarea
        id={id}
        data-testid={testId}
        value={value}
        maxLength={PROMPT_MAX}
        rows={5}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">{action}</div>
        <span
          className="text-xs text-muted-foreground tabular-nums"
          data-testid={`${testId}-count`}
        >
          {value.length} / {PROMPT_MAX}
        </span>
      </div>
    </div>
  );
}
