/**
 * R2 bundle store — the production edge read path. Cloudflare R2 speaks the S3
 * API, so we use the AWS SDK pointed at the R2 endpoint. Bundles are stored as
 * a single immutable object per environment: `<org>/<env>.json`. This is the
 * exact object the future Go data plane (and Cloudflare Workers) will read.
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { Bundle } from '@/core/types';
import type { BundleRef, BundleStore } from './store';

function objectKey(ref: BundleRef): string {
  return `${ref.organizationId}/${ref.environmentId}.json`;
}

export class R2BundleStore implements BundleStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const accountId = required('R2_ACCOUNT_ID');
    const config: S3ClientConfig = {
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required('R2_ACCESS_KEY_ID'),
        secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      },
    };
    this.client = new S3Client(config);
    this.bucket = required('R2_BUCKET');
  }

  async put(ref: BundleRef, bundle: Bundle): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(ref),
        Body: JSON.stringify(bundle),
        ContentType: 'application/json',
        // Edge readers revalidate by etag; allow short shared caching.
        CacheControl: 'public, max-age=30',
      }),
    );
  }

  async get(ref: BundleRef): Promise<Bundle | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey(ref) }),
      );
      const body = await res.Body?.transformToString();
      return body ? (JSON.parse(body) as Bundle) : null;
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when BUNDLE_STORE_DRIVER=r2`);
  return value;
}
