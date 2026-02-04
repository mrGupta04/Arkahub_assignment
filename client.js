const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:3000";
const PATH = "/device/real/query";
const TOKEN = "interview_token_123";
const RATE_LIMIT_MS = 1000;
const MAX_BATCH_SIZE = 10;
const TOTAL_DEVICES = 500;
const MAX_RETRIES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function md5(input) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function buildSerialNumbers(total) {
  const serials = [];
  for (let i = 0; i < total; i += 1) {
    const padded = String(i).padStart(3, "0");
    serials.push(`SN-${padded}`);
  }
  return serials;
}

function chunkArray(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function postJson(path, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(BASE_URL + path);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        const statusCode = res.statusCode || 0;
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch (error) {
          return reject(new Error(`Invalid JSON response (${statusCode})`));
        }
        resolve({ statusCode, body: parsed });
      });
    });

    req.on("error", (error) => reject(error));
    req.write(payload);
    req.end();
  });
}

let lastRequestTime = 0;

async function rateLimitedRequest(batch, attempt = 0) {
  const now = Date.now();
  const waitMs = Math.max(0, RATE_LIMIT_MS - (now - lastRequestTime));
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  const timestamp = Date.now().toString();
  const signature = md5(PATH + TOKEN + timestamp);
  const headers = {
    timestamp,
    signature,
  };

  lastRequestTime = Date.now();

  try {
    const response = await postJson(PATH, { sn_list: batch }, headers);

    if (response.statusCode === 200) {
      return response.body;
    }

    if (response.statusCode === 429 && attempt < MAX_RETRIES) {
      const backoff = RATE_LIMIT_MS * (attempt + 1);
      await sleep(backoff + 150);
      return rateLimitedRequest(batch, attempt + 1);
    }

    const errorMsg =
      response.body && response.body.error
        ? response.body.error
        : `Request failed with status ${response.statusCode}`;
    throw new Error(errorMsg);
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      const backoff = RATE_LIMIT_MS * (attempt + 1);
      await sleep(backoff + 150);
      return rateLimitedRequest(batch, attempt + 1);
    }
    throw error;
  }
}

async function fetchAllData() {
  const serials = buildSerialNumbers(TOTAL_DEVICES);
  const batches = chunkArray(serials, MAX_BATCH_SIZE);

  const results = [];

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const response = await rateLimitedRequest(batch);

    if (response && Array.isArray(response.data)) {
      results.push(...response.data);
    }

    console.log(`Batch ${i + 1}/${batches.length} complete.`);
  }

  return results;
}

async function main() {
  console.log("Starting EnergyGrid Data Aggregator...");
  const data = await fetchAllData();
  const report = {
    total: data.length,
    timestamp: new Date().toISOString(),
    devices: data,
  };

  const reportPath = path.join(__dirname, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("Aggregation complete.");
  console.log(`Total devices: ${report.total}`);
  console.log(`Report saved to ${reportPath}`);
}

main().catch((error) => {
  console.error("Aggregation failed:", error.message);
  process.exitCode = 1;
});
