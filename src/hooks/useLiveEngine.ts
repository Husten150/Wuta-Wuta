// src/hooks/useLiveEngine.ts
import { useEffect } from 'react';
import { ethers } from 'ethers';
import { useActivityStore } from '../store/useActivityStore';
import MuseNFTABI from '../abis/MuseNFT.json';

export const useLiveEngine = (contractAddress: string) => {
  const addActivity = useActivityStore((state) => state.addActivity);

  useEffect(() => {
    const provider = new ethers.WebSocketProvider(process.env.REACT_APP_WSS_RPC_URL!);
    const contract = new ethers.Contract(contractAddress, MuseNFTABI, provider);

    const handleTransfer = (from: string, to: string, tokenId: any, event: any) => {
      const isMint = from === ethers.ZeroAddress;
      
      addActivity({
        id: event.transactionHash,
        type: isMint ? 'MINT' : 'TRADE',
        from,
        to,
        tokenId: tokenId.toString(),
        timestamp: Date.now(),
      });
    };

    contract.on("Transfer", handleTransfer);

    return () => {
      contract.off("Transfer", handleTransfer);
    };
  }, [contractAddress, addActivity]);
};