'use client';

import { TokenManager, type TokenView } from '@/components/app/token-manager';
import { createOrgApiToken, revokeOrgApiToken } from '../actions';

export function OrgApiTokens({
  orgSlug,
  tokens,
  roleOptions,
  scopeOptions,
  canManage,
}: {
  orgSlug: string;
  tokens: TokenView[];
  roleOptions: { value: string; label: string }[];
  scopeOptions: { value: string; label: string }[];
  canManage: boolean;
}) {
  return (
    <TokenManager
      title="Organization API tokens"
      description="Provision a token that acts as this organization with a fixed role, for services, automation, and CI, so nobody has to share a personal account. You can grant up to your own role, optionally narrowed by scopes."
      tokens={tokens}
      canManage={canManage}
      roleOptions={roleOptions}
      scopeOptions={scopeOptions}
      onCreate={(i) =>
        createOrgApiToken(orgSlug, {
          name: i.name,
          role: i.role!,
          expiresInDays: i.expiresInDays,
          scopes: i.scopes,
        })
      }
      onRevoke={(id) => revokeOrgApiToken(orgSlug, id)}
    />
  );
}
