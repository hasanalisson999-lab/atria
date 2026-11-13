import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Cloudflare R2 via the S3-compatible API. Winner media is copied here because Meta CDN URLs expire. */
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class R2Storage {
  readonly client: S3Client;
  constructor(private readonly cfg: R2Config) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  get bucket() {
    return this.cfg.bucket;
  }

  /** Cheap connectivity + credentials check. Throws with a readable message on failure. */
  async healthCheck(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.cfg.bucket }));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 403) throw new Error(`R2: access denied to bucket "${this.cfg.bucket}" (check R2 token permissions)`);
      if (status === 404) throw new Error(`R2: bucket "${this.cfg.bucket}" not found`);
      throw new Error(`R2: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async put(key: string, body: Uint8Array | Buffer | string, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string) {
    return this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
}

export function r2FromEnv(env: Record<string, string | undefined> = process.env): R2Storage {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) throw new Error("R2 env vars missing");
  return new R2Storage({ accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET });
}
