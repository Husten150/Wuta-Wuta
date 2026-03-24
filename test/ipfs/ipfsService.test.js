/**
 * test/ipfs/ipfsService.test.js
 * Issue #6 — Secure Metadata Storage via IPFS/Pinata
 *
 * Jest unit tests for the IPFS service layer.
 * Pinata API calls are mocked so tests run without real credentials.
 */

import axios from "axios";
import {
  pinFileToIPFS,
  pinMetadataToIPFS,
  buildNFTMetadata,
  uploadArtworkToIPFS,
  verifyCIDPinned,
  fetchMetadataFromIPFS,
} from "../../src/services/ipfsService";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("axios");

const MOCK_IMAGE_CID    = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const MOCK_METADATA_CID = "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354";

// Restore env variable before each test
beforeEach(() => {
  process.env.REACT_APP_PINATA_JWT = "test-jwt-token";
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── 1. pinFileToIPFS ─────────────────────────────────────────────────────────

describe("pinFileToIPFS", () => {
  it("returns the IPFS CID on success", async () => {
    axios.post.mockResolvedValueOnce({ data: { IpfsHash: MOCK_IMAGE_CID } });

    const file = new Blob(["fake-image-data"], { type: "image/png" });
    const cid  = await pinFileToIPFS(file, "artwork-001");

    expect(cid).toBe(MOCK_IMAGE_CID);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/pinning/pinFileToIPFS"),
      expect.any(FormData),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-jwt-token" }) })
    );
  });

  it("throws when JWT is missing", async () => {
    delete process.env.REACT_APP_PINATA_JWT;
    const file = new Blob(["data"], { type: "image/png" });
    await expect(pinFileToIPFS(file, "artwork-002")).rejects.toThrow(
      "REACT_APP_PINATA_JWT is not set"
    );
  });

  it("propagates Pinata API errors", async () => {
    axios.post.mockRejectedValueOnce(new Error("Pinata 401 Unauthorized"));
    const file = new Blob(["data"], { type: "image/png" });
    await expect(pinFileToIPFS(file, "artwork-003")).rejects.toThrow("Pinata 401 Unauthorized");
  });
});

// ─── 2. pinMetadataToIPFS ─────────────────────────────────────────────────────

describe("pinMetadataToIPFS", () => {
  it("returns the metadata CID on success", async () => {
    axios.post.mockResolvedValueOnce({ data: { IpfsHash: MOCK_METADATA_CID } });

    const metadata = { name: "Test Art", image: `ipfs://${MOCK_IMAGE_CID}` };
    const cid      = await pinMetadataToIPFS(metadata, "artwork-001");

    expect(cid).toBe(MOCK_METADATA_CID);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/pinning/pinJSONToIPFS"),
      expect.objectContaining({ pinataContent: metadata }),
      expect.any(Object)
    );
  });

  it("includes correct Pinata metadata labels", async () => {
    axios.post.mockResolvedValueOnce({ data: { IpfsHash: MOCK_METADATA_CID } });

    await pinMetadataToIPFS({ name: "X" }, "artwork-xyz");

    const callBody = axios.post.mock.calls[0][1];
    expect(callBody.pinataMetadata.name).toBe("muse-metadata-artwork-xyz");
    expect(callBody.pinataMetadata.keyvalues.project).toBe("Wuta-Wuta");
    expect(callBody.pinataMetadata.keyvalues.type).toBe("metadata");
  });
});

// ─── 3. buildNFTMetadata ─────────────────────────────────────────────────────

describe("buildNFTMetadata", () => {
  const params = {
    name: "Dreamscape #001",
    description: "A collaborative piece",
    imageCID: MOCK_IMAGE_CID,
    artistAddress: "0xArtist123",
    aiModel: "Stable Diffusion",
    collaborators: ["0xCollaborator1"],
  };

  it("sets image as ipfs:// URI", () => {
    const meta = buildNFTMetadata(params);
    expect(meta.image).toBe(`ipfs://${MOCK_IMAGE_CID}`);
  });

  it("includes AI model in attributes", () => {
    const meta = buildNFTMetadata(params);
    const aiAttr = meta.attributes.find((a) => a.trait_type === "AI Model");
    expect(aiAttr?.value).toBe("Stable Diffusion");
  });

  it("includes AI-Human collaboration type", () => {
    const meta = buildNFTMetadata(params);
    const collabAttr = meta.attributes.find((a) => a.trait_type === "Collaboration Type");
    expect(collabAttr?.value).toBe("AI-Human");
  });

  it("stores artist address", () => {
    const meta = buildNFTMetadata(params);
    expect(meta.artist).toBe("0xArtist123");
  });

  it("includes collaborators array", () => {
    const meta = buildNFTMetadata(params);
    expect(meta.collaborators).toContain("0xCollaborator1");
  });

  it("handles empty collaborators gracefully", () => {
    const meta = buildNFTMetadata({ ...params, collaborators: undefined });
    expect(meta.collaborators).toEqual([]);
  });
});

// ─── 4. uploadArtworkToIPFS (full pipeline) ───────────────────────────────────

describe("uploadArtworkToIPFS", () => {
  it("returns imageCID, metadataCID, and tokenURI", async () => {
    // Mock: first call pins image, second call pins metadata
    axios.post
      .mockResolvedValueOnce({ data: { IpfsHash: MOCK_IMAGE_CID } })
      .mockResolvedValueOnce({ data: { IpfsHash: MOCK_METADATA_CID } });

    const file = new Blob(["img"], { type: "image/png" });
    const result = await uploadArtworkToIPFS(file, {
      artworkId: "test-001",
      name: "Test Art",
      description: "Desc",
      artistAddress: "0xAbc",
      aiModel: "DALL-E 3",
    });

    expect(result.imageCID).toBe(MOCK_IMAGE_CID);
    expect(result.metadataCID).toBe(MOCK_METADATA_CID);
    expect(result.tokenURI).toBe(`ipfs://${MOCK_METADATA_CID}`);
  });

  it("calls pinFileToIPFS before pinMetadataToIPFS", async () => {
    const callOrder = [];
    axios.post.mockImplementation((url) => {
      if (url.includes("pinFileToIPFS"))  callOrder.push("file");
      if (url.includes("pinJSONToIPFS"))  callOrder.push("json");
      return Promise.resolve({ data: { IpfsHash: "bafytest" } });
    });

    const file = new Blob(["img"], { type: "image/png" });
    await uploadArtworkToIPFS(file, {
      artworkId: "order-test",
      name: "X", description: "Y", artistAddress: "0x1", aiModel: "SD",
    });

    expect(callOrder).toEqual(["file", "json"]);
  });
});

// ─── 5. verifyCIDPinned ───────────────────────────────────────────────────────

describe("verifyCIDPinned", () => {
  it("returns true when Pinata reports count > 0", async () => {
    axios.get.mockResolvedValueOnce({ data: { count: 1 } });
    const result = await verifyCIDPinned(MOCK_METADATA_CID);
    expect(result).toBe(true);
  });

  it("returns false when count is 0 (not pinned)", async () => {
    axios.get.mockResolvedValueOnce({ data: { count: 0 } });
    const result = await verifyCIDPinned(MOCK_METADATA_CID);
    expect(result).toBe(false);
  });

  it("passes hashContains and status=pinned as query params", async () => {
    axios.get.mockResolvedValueOnce({ data: { count: 1 } });
    await verifyCIDPinned(MOCK_IMAGE_CID);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/pinning/pinList"),
      expect.objectContaining({
        params: { hashContains: MOCK_IMAGE_CID, status: "pinned" },
      })
    );
  });
});

// ─── 6. fetchMetadataFromIPFS ─────────────────────────────────────────────────

describe("fetchMetadataFromIPFS", () => {
  it("fetches and returns parsed metadata JSON", async () => {
    const mockMeta = { name: "Dreamscape", image: `ipfs://${MOCK_IMAGE_CID}` };
    axios.get.mockResolvedValueOnce({ data: mockMeta });

    const result = await fetchMetadataFromIPFS(MOCK_METADATA_CID);
    expect(result).toEqual(mockMeta);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining(MOCK_METADATA_CID)
    );
  });
});