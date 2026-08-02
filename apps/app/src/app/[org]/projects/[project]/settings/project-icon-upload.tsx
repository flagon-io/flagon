"use client";

import { ImageUpload } from "@/components/image-upload";
import { FrameworkIcon } from "@/components/framework-badge";
import {
  finishProjectIconUploadAction,
  removeProjectIconAction,
  startProjectIconUploadAction,
} from "../../actions";

/**
 * Project icon uploader — thin wrapper over ImageUpload, wiring the project-icon
 * purpose + persist. Falls back to the stack monogram preview when unset.
 */
export function ProjectIconUpload({
  slug,
  projectKey,
  framework,
  initialImage,
  canManage,
  uploadsEnabled,
  maxSizeBytes,
  acceptedTypes,
}: {
  slug: string;
  projectKey: string;
  framework: string | null;
  initialImage: string | null;
  canManage: boolean;
  uploadsEnabled: boolean;
  maxSizeBytes: number;
  acceptedTypes: string[];
}) {
  return (
    <ImageUpload
      currentUrl={initialImage}
      canManage={canManage}
      uploadsEnabled={uploadsEnabled}
      maxSizeBytes={maxSizeBytes}
      acceptedTypes={acceptedTypes}
      uploadLabel="Upload icon"
      fallback={
        <FrameworkIcon framework={framework} size="lg" className="size-16 rounded-xl text-lg" />
      }
      onStart={(body) => startProjectIconUploadAction(slug, body)}
      onFinish={(assetId) => finishProjectIconUploadAction(slug, projectKey, assetId)}
      onRemove={() => removeProjectIconAction(slug, projectKey)}
    />
  );
}
