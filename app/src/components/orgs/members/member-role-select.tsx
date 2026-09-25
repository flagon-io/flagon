"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@flagon-io/ui";

/** Org membership role picker. Only owners can grant "owner". */
export function MemberRoleSelect({
  value,
  onChange,
  allowOwner,
}: {
  value: string;
  onChange: (role: string) => void;
  allowOwner: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-full capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* "viewer" is legacy (read-only membership is now the org base permission);
            still shown if an existing member somehow has it, so their role is visible. */}
        {value === "viewer" && <SelectItem value="viewer">Viewer</SelectItem>}
        <SelectItem value="member">Member</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
        {(allowOwner || value === "owner") && <SelectItem value="owner">Owner</SelectItem>}
      </SelectContent>
    </Select>
  );
}
