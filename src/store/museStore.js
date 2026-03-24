import { create } from 'zustand';
import {
  Server,
  Keypair,
  TransactionBuilder,
  Operation,
  Networks,
  Asset,
  Contract,
  SorobanRpc
} from '@stellar/stellar-sdk';

import { useTransactionNotificationStore } from './transactionNotificationStore';

const useMuseStore = create((set, get) => ({
  // State
  isConnected: false,
  isLoading: false,
  error: null,

  // Stellar connection
  stellarClient: null,
  horizonServer: null,
  network: Networks.FUTURENET,
  rpcUrl: 'https://rpc-futurenet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',

  // Contract addresses
  contracts: {
    artAssetToken: null,
    nftMarketplace: null,
  },

  // User data
  userAddress: null,
  userKeypair: null,

  // Artwork data
  artworks: [],
  listings: [],
  offers: [],

  // Initialize Stellar connection
  initializeMuse: async () => {
    try {
      set({ isLoading: true, error: null });

      const stellarClient = new SorobanRpc.Server(get().rpcUrl); // Soroban RPC client
      const horizonServer = new Server(get().horizonUrl); // Horizon server

      const contracts = {
        artAssetToken: process.env.REACT_APP_ART_ASSET_TOKEN_CONTRACT || 'art_asset_token',
        nftMarketplace: process.env.REACT_APP_NFT_MARKETPLACE_CONTRACT || 'nft_marketplace',
      };

      set({
        stellarClient,
        horizonServer,
        contracts,
        isConnected: true,
        isLoading: false
      });

      get().loadMarketplaceData();
    } catch (error) {
      console.error('Failed to initialize Muse:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  connectStellarWallet: async (secretKey) => {
    try {
      set({ isLoading: true, error: null });

      const keypair = Keypair.fromSecret(secretKey);
      const userAddress = keypair.publicKey();

      set({
        userAddress,
        userKeypair: keypair,
        isLoading: false,
      });

      get().loadUserArtworks(userAddress);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  disconnectWallet: () => {
    set({
      userAddress: null,
      userKeypair: null,
      artworks: [],
    });
  },

  // Example: mint NFT using Stellar SDK + Soroban RPC
  createCollaborativeArtwork: async (params) => {
    try {
      set({ isLoading: true, error: null });

      const { stellarClient, contracts, userAddress } = get();
      if (!stellarClient || !userAddress) throw new Error('Not connected to Stellar');

      const metadata = {
        prompt: params.prompt,
        aiModel: params.aiModel,
        humanContribution: params.humanContribution,
        aiContribution: params.aiContribution,
        canEvolve: params.canEvolve,
        timestamp: Date.now(),
      };

      const transactionId = `artwork-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const notificationStore = useTransactionNotificationStore.getState();
      notificationStore.addTransaction({
        id: transactionId,
        type: 'NFT Mint',
        details: { prompt: params.prompt, aiModel: params.aiModel, userAddress }
      });

      // Build Soroban transaction
      const tx = new TransactionBuilder(userAddress, {
        fee: 100,
        networkPassphrase: get().network
      })
        .addOperation(Operation.invokeHostFunction({
          contract: new Contract(contracts.artAssetToken),
          functionName: 'mint',
          args: [
            userAddress,
            1,
            JSON.stringify(metadata),
            params.contentHash || '0x0000000000000000000000000000000000000000'
          ]
        }))
        .setTimeout(30)
        .build();

      const signedTx = tx.sign(get().userKeypair); // Sign transaction
      const txResult = await stellarClient.sendTransaction(signedTx); // Send to Soroban RPC

      if (txResult.hash) {
        notificationStore.updateTransactionStatus(transactionId, notificationStore.STATUS.PENDING, {
          hash: txResult.hash
        });
      }

      const aiGeneratedImage = await get().generateArtwork(params);

      const newArtwork = {
        id: Date.now().toString(),
        tokenUri: `https://api.muse.art/metadata/${Date.now()}`,
        imageUrl: aiGeneratedImage,
        metadata,
        owner: userAddress,
        createdAt: new Date().toISOString(),
        transactionId,
      };

      set(state => ({ artworks: [...state.artworks, newArtwork], isLoading: false }));

      return newArtwork;
    } catch (error) {
      console.error('Failed to create artwork:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  generateArtwork: async (params) => {
    const aiModels = {
      'stable-diffusion': 'https://api.muse.art/generated/stable-diffusion.jpg',
      'dall-e-3': 'https://api.muse.art/generated/dall-e-3.jpg',
      'midjourney': 'https://api.muse.art/generated/midjourney.jpg',
    };
    return aiModels[params.aiModel] || aiModels['stable-diffusion'];
  },

  loadMarketplaceData: async () => {
    try {
      const { stellarClient, contracts } = get();
      if (!stellarClient || !contracts.nftMarketplace) return;

      const listings = await stellarClient.getContractData(
        contracts.nftMarketplace,
        'get_active_listings',
        []
      );
      set({ listings: listings || [] });
    } catch (error) {
      console.error('Failed to load marketplace data:', error);
    }
  },

  loadUserArtworks: async (userAddress) => {
    set({ artworks: [] });
  },
}));

export { useMuseStore };