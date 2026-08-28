require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const PORT = process.env.PORT || 8787;
const SECRET = process.env.DOWNLOAD_TOKEN_SECRET;
const BUCKET = process.env.MINIO_BUCKET;

function isValidUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Fail loudly at startup instead of only failing (cryptically) on the first
// real request — this is exactly the class of bug that cost real debugging
// time: the server started fine with a bad/missing MINIO_ENDPOINT, and every
// download just silently 404'd with "Invalid URL" in the logs.
const problems = [];
if (!SECRET) problems.push("DOWNLOAD_TOKEN_SECRET дутуу байна");
if (!BUCKET) problems.push("MINIO_BUCKET дутуу байна");
if (!isValidUrl(process.env.MINIO_ENDPOINT)) {
  problems.push(`MINIO_ENDPOINT буруу URL байна: "${process.env.MINIO_ENDPOINT}" (жишээ: http://127.0.0.1:9000)`);
}
if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
  problems.push("MINIO_ACCESS_KEY / MINIO_SECRET_KEY дутуу байна");
}
if (problems.length > 0) {
  console.error("Тохиргооны алдаа (.env):\n" + problems.map((p) => `  - ${p}`).join("\n"));
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
  // Every response here is either time-limited (the signed URL expires) or a
  // per-request error — Cloudflare/browsers must never cache any of it, or a
  // transient failure gets served back as a permanent one.
  res.setHeader("Cache-Control", "no-store");

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
