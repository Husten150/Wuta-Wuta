/**
 * test/MuseNFT.test.js  (extended for Issue #6)
 * Issue #6 — Secure Metadata Storage via IPFS/Pinata
 *
 * Hardhat/Chai tests for the MuseNFT contract, focusing on
 * IPFS URI enforcement and IPFS provenance storage.
 */

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─── Fixture ──────────────────────────────────────────────────────────────────

async function deployMuseNFTFixture() {
  const [owner, artist, buyer] = await ethers.getSigners();
  const MuseNFT = await ethers.getContractFactory("MuseNFT");
  const contract = await MuseNFT.deploy();
  return { contract, owner, artist, buyer };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_IMAGE_CID    = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const VALID_METADATA_CID = "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354";
const VALID_TOKEN_URI    = `ipfs://${VALID_METADATA_CID}`;
const AI_MODEL           = "Stable Diffusion";
const ROYALTY_BPS        = 500; // 5%

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MuseNFT — Issue #6: IPFS Metadata Security", function () {

  // ── Minting with valid IPFS URI ──────────────────────────────────────────

  describe("mintArtwork — valid IPFS URI", function () {
    it("mints successfully with an ipfs:// tokenURI", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await expect(
        contract.mintArtwork(
          artist.address,
          VALID_TOKEN_URI,
          VALID_IMAGE_CID,
          AI_MODEL,
          ROYALTY_BPS
        )
      ).to.emit(contract, "ArtworkMinted");
    });

    it("assigns the correct tokenURI on-chain", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await contract.mintArtwork(
        artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL, ROYALTY_BPS
      );

      expect(await contract.tokenURI(1)).to.equal(VALID_TOKEN_URI);
    });

    it("stores the artwork image CID", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await contract.mintArtwork(
        artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL, ROYALTY_BPS
      );

      expect(await contract.artworkImageCID(1)).to.equal(VALID_IMAGE_CID);
    });

    it("stores the AI model used", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await contract.mintArtwork(
        artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL, ROYALTY_BPS
      );

      expect(await contract.artworkAIModel(1)).to.equal(AI_MODEL);
    });

    it("stores the artist address", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await contract.mintArtwork(
        artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL, ROYALTY_BPS
      );

      expect(await contract.artworkArtist(1)).to.equal(artist.address);
    });

    it("sets royalty correctly", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await contract.mintArtwork(
        artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL, ROYALTY_BPS
      );

      const [receiver, amount] = await contract.royaltyInfo(1, 10000);
      expect(receiver).to.equal(artist.address);
      expect(amount).to.equal(500); // 5% of 10000
    });

    it("increments totalMinted", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await contract.mintArtwork(
        artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL, ROYALTY_BPS
      );
      await contract.mintArtwork(
        artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL, ROYALTY_BPS
      );

      expect(await contract.totalMinted()).to.equal(2);
    });
  });

  // ── IPFS URI Enforcement (Issue #6 core security) ────────────────────────

  describe("mintArtwork — IPFS URI enforcement", function () {
    it("REVERTS when tokenURI uses http://", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await expect(
        contract.mintArtwork(
          artist.address,
          "http://example.com/metadata.json",
          VALID_IMAGE_CID,
          AI_MODEL,
          ROYALTY_BPS
        )
      ).to.be.revertedWith("MuseNFT: tokenURI must be an IPFS URI (ipfs://...)");
    });

    it("REVERTS when tokenURI uses https://", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await expect(
        contract.mintArtwork(
          artist.address,
          "https://api.example.com/token/1",
          VALID_IMAGE_CID,
          AI_MODEL,
          ROYALTY_BPS
        )
      ).to.be.revertedWith("MuseNFT: tokenURI must be an IPFS URI (ipfs://...)");
    });

    it("REVERTS when tokenURI is an empty string", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await expect(
        contract.mintArtwork(
          artist.address, "", VALID_IMAGE_CID, AI_MODEL, ROYALTY_BPS
        )
      ).to.be.revertedWith("MuseNFT: tokenURI must be an IPFS URI (ipfs://...)");
    });

    it("REVERTS when imageCID is empty", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await expect(
        contract.mintArtwork(
          artist.address, VALID_TOKEN_URI, "", AI_MODEL, ROYALTY_BPS
        )
      ).to.be.revertedWith("MuseNFT: imageCID cannot be empty");
    });

    it("REVERTS when royalty exceeds 10%", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await expect(
        contract.mintArtwork(
          artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL, 1001
        )
      ).to.be.revertedWith("MuseNFT: royalty cannot exceed 10%");
    });
  });

  // ── Gateway URL helper ────────────────────────────────────────────────────

  describe("artworkGatewayURL", function () {
    it("returns the Pinata gateway URL for the image", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await contract.mintArtwork(
        artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL, ROYALTY_BPS
      );

      const url = await contract.artworkGatewayURL(1);
      expect(url).to.equal(
        `https://gateway.pinata.cloud/ipfs/${VALID_IMAGE_CID}`
      );
    });

    it("reverts for a non-existent token", async function () {
      const { contract } = await loadFixture(deployMuseNFTFixture);
      await expect(contract.artworkGatewayURL(999)).to.be.revertedWith(
        "MuseNFT: token does not exist"
      );
    });
  });

  // ── Event emission ────────────────────────────────────────────────────────

  describe("ArtworkMinted event", function () {
    it("emits with correct args", async function () {
      const { contract, artist } = await loadFixture(deployMuseNFTFixture);

      await expect(
        contract.mintArtwork(
          artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL, ROYALTY_BPS
        )
      )
        .to.emit(contract, "ArtworkMinted")
        .withArgs(1, artist.address, VALID_TOKEN_URI, VALID_IMAGE_CID, AI_MODEL);
    });
  });
});