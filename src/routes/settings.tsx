import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsRow,
  SettingsSection,
} from "@/client/components/SettingsSection";
import { StudioShell } from "@/client/components/studio/StudioShell";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { getSettings, saveSettings } from "@/serverFunctions/settings";
import { MAX_DAILY_LIMIT } from "@/shared/options";

export const Route = createFileRoute("/settings")({
  loader: () => getSettings(),
  head: () => ({ meta: [{ title: "Settings · Image Studio" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const settings = Route.useLoaderData();
  return (
    <StudioShell>
      <PageHeader title="Settings" />
      {settings ? (
        <LimitForm initial={settings.dailyImageLimit} />
      ) : (
        <div data-testid="admin-only">
          <EmptyState
            icon={ShieldAlert}
            title="Only admins can open settings"
          />
        </div>
      )}
    </StudioShell>
  );
}

function LimitForm({ initial }: { initial: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(initial));
  const [saving, setSaving] = useState(false);
  const parsed = Number(value);
  const valid =
    value.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= MAX_DAILY_LIMIT;

  async function save() {
    setSaving(true);
    try {
      await saveSettings({ data: { dailyImageLimit: parsed } });
      toast.success("Saved.");
      await router.invalidate();
    } catch {
      toast.error("It couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection title="Usage">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void save();
        }}
      >
        <SettingsCard>
          <SettingsRow
            label="Daily image limit"
            description="Per member, across creating and editing. Resets at midnight UTC."
            htmlFor="daily-limit"
          >
            <Input
              id="daily-limit"
              data-testid="daily-limit"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_DAILY_LIMIT}
              className="w-28"
              value={value}
              aria-invalid={!valid || undefined}
              onChange={(event) => setValue(event.target.value)}
            />
            <span className="text-sm text-muted-foreground">images</span>
          </SettingsRow>
          <SettingsCardFooter>
            <Button
              type="submit"
              size="sm"
              data-testid="save-limit"
              disabled={!valid || parsed === initial}
              pending={saving}
            >
              Save
            </Button>
          </SettingsCardFooter>
        </SettingsCard>
      </form>
    </SettingsSection>
  );
}
