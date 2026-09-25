import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getR2Bucket } from "./storage";

/**
 * Reads a JSON object stored in R2 under `data/<key>.json`. Returns
 * `fallback` if the object doesn't exist yet (first run).
 *
 * Why R2 and not the local filesystem: Vercel's serverless functions have
 * a read-only filesystem in production (except /tmp, which is ephemeral
 * and not shared across instances) — so `fs.writeFileSync` works locally
 * in dev but throws ENOENT/EROFS in production. Since R2 is already wired
 * up for images, we reuse it here instead of adding a separate database.
 */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const s3 = getR2Client();
    const res = await s3.send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: `data/${key}.json` })
    );
    const text = await res.Body!.transformToString();
    return JSON.parse(text) as T;
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return fallback;
    }
    throw err;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  const s3 = getR2Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: `data/${key}.json`,
      Body: JSON.stringify(value, null, 2),
      ContentType: "application/json",
    })
  );
}
