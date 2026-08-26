require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const PORT = process.env.PORT || 8787;
const SECRET = process.env.DOWNLOAD_TOKEN_SECRET;
const BUCKET = process.env.MINIO_BUCKET;

if (!SECRET || !BUCKET) {
  console.error("DOWNLOAD_TOKEN_SECRET and MINIO_BUCKET are required — check .env");
  process.exit(1);
}

const s3 = new S3Client({
  region: process.env.MINIO_REGION || "us-east-1",
  endpoint: process.env.MINIO_ENDPOINT,
  forcePathStyle: true, // required for MinIO
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
});

const app = express();
app.disable("x-powered-by");

/**
 * Validates the same HMAC scheme filetat generates in lib/storage/s3.ts:
 *   token = HMAC-SHA256(secret, `${key}:${expires}`), hex-encoded
 *   GET /download/:key?expires=<unix seconds>&token=<hex>
 * `:key` is a single encodeURIComponent'd path segment (may contain %2F).
 */
function isValidToken(key, expires, token) {
  if (!expires || !token) return false;
  if (Date.now() / 1000 > Number(expires)) return false;

  const expected = crypto.createHmac("sha256", SECRET).update(`${key}:${expires}`).digest("hex");
  const a = Buffer.from(token, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

app.get("/download/:key", async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const { expires, token } = req.query;

  if (!isValidToken(key, expires, token)) {
    return res.status(403).send("Invalid or expired link");
  }

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    res.setHeader("Content-Type", obj.ContentType || "application/octet-stream");
    if (obj.ContentLength) res.setHeader("Content-Length", String(obj.ContentLength));
    const filename = key.split("/").pop();
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    obj.Body.pipe(res);
  } catch (e) {
    console.error(`Download failed for key "${key}":`, e.message);
    res.status(404).send("Not found");
  }
});

app.get("/health", (_req, res) => res.send("ok"));

app.listen(PORT, () => console.log(`filetat-storage-proxy listening on :${PORT}`));
