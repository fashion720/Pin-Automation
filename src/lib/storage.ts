import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

/**
 * Cloudflare R2 (S3-compatible, free tier up to 10GB storage).
 *
 * Setup (one-time, ~5 min):
 * 1. Cloudflare dashboard → R2 → Create bucket (any name, e.g. "pin-batch").
 * 2. Bucket → Settings → Public access → enable (free "r2.dev" subdomain,
 *    or your own custom domain). Copy that base URL.
 * 3. Bucket → Settings → CORS Policy → add a rule so the BROWSER can
 *    upload directly to R2 (this is required for the template/pin
 *    upload pages to work — without it you'll get a CORS error):
 *    [
 *      {
 *        "AllowedOrigins": ["*"],
 *        "AllowedMethods": ["PUT"],
 *        "AllowedHeaders": ["*"]
 *      }
 *    ]
 *    (Once deployed, you can tighten "AllowedOrigins" to your real domain.)
 * 4. R2 → Manage API tokens → create a token with "Object Read & Write"
 *    permission on this bucket. Copy Account ID, Access Key ID, Secret.
 * 5. Fill into .env.local:
 *    R2_ACCOUNT_ID=...
 *    R2_ACCESS_KEY_ID=...
 *    R2_SECRET_ACCESS_KEY=...
 *    R2_BUCKET_NAME=pin-batch
 *    R2_PUBLIC_URL_BASE=https://pub-xxxxxxxx.r2.dev
 */

let client: S3Client | null = null;

function getClient() {
  if (!client) {
    const required = [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_PUBLIC_URL_BASE",
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
      throw new Error(
        `R2 env vars missing: ${missing.join(", ")} — .env.local mein daalo (README dekho)`
      );
    }

    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      // R2 doesn't support the AWS SDK's newer automatic request-checksum
      // feature — leaving it on adds x-amz-checksum-* headers that make
      // the browser's CORS preflight fail against R2, even with a correct
      // CORS policy. Forcing "WHEN_REQUIRED" disables it unless an
      // operation truly needs it.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

export function getR2Client() {
  return getClient();
}

export function getR2Bucket() {
  return process.env.R2_BUCKET_NAME!;
}

function publicUrlFor(key: string) {
  const base = process.env.R2_PUBLIC_URL_BASE!.replace(/\/$/, "");
  return `${base}/${key}`;
}

/**
 * Used by /api/generate — the server itself composes a pin image (small,
 * a few hundred KB) and uploads it directly. No client → server transfer
 * involved here, so this is unaffected by the request-size issue below.
 */
export async function saveGeneratedImage(buffer: Buffer, filename: string): Promise<string> {
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: filename,
      Body: buffer,
      ContentType: "image/png",
    })
  );
  return publicUrlFor(filename);
}

/**
 * Used when the BROWSER needs to upload a file directly (template
 * uploads, manual pin uploads) — returns a short-lived signed URL that
 * the browser can PUT the file to directly, bypassing our Next.js
 * server entirely. This is what avoids the "Request Entity Too Large"
 * error, since large files never pass through our serverless function
 * (which has a hard ~4.5MB request-body limit on Vercel).
 */
export async function getPresignedUploadUrl(prefix: string, contentType: string) {
  const s3 = getClient();
  const ext = contentType === "image/jpeg" ? "jpg" : "png";
  const key = `${prefix}/${randomUUID()}.${ext}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 }
  );

  return { uploadUrl, publicUrl: publicUrlFor(key), key };
}

/** Deletes an R2 object given its public URL (used when deleting a custom template). */
export async function deleteByPublicUrl(url: string) {
  const base = process.env.R2_PUBLIC_URL_BASE!.replace(/\/$/, "");
  if (!url.startsWith(base)) return; // not an R2 URL (e.g. a built-in local template) — nothing to do
  const key = url.slice(base.length + 1);
  const s3 = getClient();
  await s3.send(
    new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key })
  );
}
