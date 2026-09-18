import { SettingsHeader, SettingsSubheader } from "@/components/settings/section";
import { AppearanceForm } from "@/components/settings/appearance-form";

export default function AppearancePage() {
  return (
    <div>
      <SettingsHeader title="Appearance" />
      <section className="space-y-4">
        <SettingsSubheader
          title="Theme"
          description="Choose how Flagon looks to you. Select a single theme, or sync with your system."
        />
        <AppearanceForm />
      </section>
    </div>
  );
}
