'use client';

import { TokenManager, type TokenView } from '@/components/app/token-manager';
import { createPersonalAccessToken, revokePersonalAccessToken } from './actions';

export function PersonalAccessTokens({
  tokens,
  scopeOptions,
}: {
  tokens: TokenView[];
  scopeOptions: { value: string; label: string }[];
}) {
  return (
    <TokenManager
      title="Personal access tokens"
      description="Use the Flagon API as yourself from scripts and CI. A token carries your current permissions in every organization you belong to (optionally narrowed by scopes); revoking your access anywhere takes effect immediately."
      tokens={tokens}
      scopeOptions={scopeOptions}
      onCreate={(i) =>
        createPersonalAccessToken({ name: i.name, expiresInDays: i.expiresInDays, scopes: i.scopes })
      }
      onRevoke={(id) => revokePersonalAccessToken(id)}
    />
  );
}
