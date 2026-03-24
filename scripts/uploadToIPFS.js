#!/usr/bin/env node
/**
 * scripts/uploadToIPFS.js
 * Issue #6 — Secure Metadata Storage via IPFS/Pinata
 *
 * Standalone Node.js script to upload an artwork file + metadata to IPFS.
 * Run this to manually verify your Pinata credentials and the upload pipeline.
 *
 * Usage:
 *   node scripts/uploadToIPFS.js <path-to-image> <artist-address> <artwork-title>
 *
 * Example:
 *   node scripts/uploadToIPFS.js ./sample.png 0xYourAddress "Dreamscape #001"
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

// ─── Config ───────────────────────────────────────────────────────────────────

const PINATA_API_URL = "https://api.pinata.cloud";
const JWT = process.env.REACT_APP_PINATA_JWT;

if (!JWT) {
  console.error(
    "❌  REACT_APP_PINATA_JWT is not set. Add it to your .env file.",
  );
  process.exit(1);
}

const headers = { Authorization: `Bearer ${JWT}` };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function pinFile(filePath, artworkId) {
  console.log(`\n📁  Pinning file: ${filePath}`);
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
  form.append(
    "pinataMetadata",
    JSON.stringify({
      name: `muse-artwork-${artworkId}`,
      keyvalues: { project: "Wuta-Wuta", type: "artwork", artworkId },
    }),
  );
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await axios.post(
    `${PINATA_API_URL}/pinning/pinFileToIPFS`,
    form,
    {
      maxBodyLength: Infinity,
      headers: { ...headers, ...form.getHeaders() },
    },
  );
  return res.data.IpfsHash;
}

async function pinMetadata(metadata, artworkId) {
  console.log(`\n📄  Pinning metadata JSON…`);
  const res = await axios.post(
    `${PINATA_API_URL}/pinning/pinJSONToIPFS`,
    {
      pinataContent: metadata,
      pinataMetadata: {
        name: `muse-metadata-${artworkId}`,
        keyvalues: { project: "Wuta-Wuta", type: "metadata", artworkId },
      },
      pinataOptions: { cidVersion: 1 },
    },
    { headers: { ...headers, "Content-Type": "application/json" } },
  );
  return res.data.IpfsHash;
}

async function verifyPin(cid) {
  const res = await axios.get(`${PINATA_API_URL}/pinning/pinList`, {
    headers,
    params: { hashContains: cid, status: "pinned" },
  });
  return res.data.count > 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const [, , imagePath, artistAddress, artworkTitle] = process.argv;

  if (!imagePath || !artistAddress || !artworkTitle) {
    console.error(
      "Usage: node scripts/uploadToIPFS.js <image-path> <artist-address> <artwork-title>",
    );
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`❌  File not found: ${imagePath}`);
    process.exit(1);
  }

  const artworkId = `muse-${Date.now()}`;

  try {
    // 1. Pin image
    const imageCID = await pinFile(imagePath, artworkId);
    console.log(`✅  Image CID   : ${imageCID}`);
    console.log(
      `    Gateway URL : https://gateway.pinata.cloud/ipfs/${imageCID}`,
    );

    // 2. Build metadata
    const metadata = {
      name: artworkTitle,
      description: `AI-Human collaborative artwork — ${artworkTitle}`,
      image: `ipfs://${imageCID}`,
      external_url: `https://gateway.pinata.cloud/ipfs/${imageCID}`,
      artist: artistAddress,
      ai_model: "Stable Diffusion",
      collaborators: [],
      created_at: new Date().toISOString(),
      attributes: [
        { trait_type: "AI Model", value: "Stable Diffusion" },
        { trait_type: "Collaboration Type", value: "AI-Human" },
        { trait_type: "Artist", value: artistAddress },
      ],
    };

    // 3. Pin metadata
    const metadataCID = await pinMetadata(metadata, artworkId);
    console.log(`✅  Metadata CID: ${metadataCID}`);
    console.log(
      `    Gateway URL : https://gateway.pinata.cloud/ipfs/${metadataCID}`,
    );

    // 4. Verify
    const verified = await verifyPin(metadataCID);
    console.log(`\n🔍  Pin verified: ${verified ? "✅ YES" : "⚠️  NOT FOUND"}`);

    // 5. Print token URI
    const tokenURI = `ipfs://${metadataCID}`;
    console.log(`\n🎉  Token URI (pass this to MuseNFT.mintArtwork):`);
    console.log(`    ${tokenURI}`);
  } catch (err) {
    console.error("\n❌  Upload failed:", err.response?.data || err.message);
    process.exit(1);
  }
})();
