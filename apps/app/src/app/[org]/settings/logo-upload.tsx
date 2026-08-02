"use client";

import { ImageUpload } from "@/components/image-upload";
import {
  finishLogoUploadAction,
  removeOrgLogoAction,
  startLogoUploadAction,
} from "./actions";

/**
 * Org logo uploader — a thin wrapper over the generic ImageUpload, wiring the
 * org-logo purpose + persist and a lettered fallback preview.
 */
export function LogoUpload({
  slug,
  orgName,
  initialLogo,
  canManage,
  uploadsEnabled,
  maxSizeBytes,
  acceptedTypes,
}: {
  slug: string;
  orgName: string;
  initialLogo: string | null;
  canManage: boolean;
  uploadsEnabled: boolean;
  maxSizeBytes: number;
  acceptedTypes: string[];
}) {
  return (
    <ImageUpload
      currentUrl={initialLogo}
      canManage={canManage}
      uploadsEnabled={uploadsEnabled}
      maxSizeBytes={maxSizeBytes}
      acceptedTypes={acceptedTypes}
      uploadLabel="Upload logo"
      fallback={
        <span className="grid size-16 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-lg font-semibold text-zinc-300">
          {orgName.slice(0, 1).toUpperCase()}
        </span>
      }
      onStart={(body) => startLogoUploadAction(slug, body)}
      onFinish={(assetId) => finishLogoUploadAction(slug, assetId)}
      onRemove={() => removeOrgLogoAction(slug)}
    />
  );
}
