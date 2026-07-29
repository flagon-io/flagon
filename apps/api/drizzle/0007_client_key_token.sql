-- Client keys are publishable (they ship in client apps), so store the plaintext
-- to make them retrievable in the console. Keys minted before this stay NULL and
-- remain masked; keyHash is still the authentication lookup path.
ALTER TABLE "sdk_keys" ADD COLUMN "token" text;
