const { ethers } = require("ethers");
const fs = require("fs");
const config = require("./config");

async function initializeBlockchain() {
  if (!fs.existsSync(config.contractInfoPath)) {
    throw new Error(
      `${config.contractInfoPath} not found. Deploy the contract first: npm run deploy`
    );
  }

  const contractInfo = JSON.parse(fs.readFileSync(config.contractInfoPath, "utf8"));

  if (!contractInfo.address || !Array.isArray(contractInfo.abi)) {
    throw new Error("Contract info file must contain address and abi");
  }

  // No response cache: ethers otherwise reuses a nonce read for 250 ms, so two
  // transactions sent back to back (votes, admin phase changes) would collide.
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 });

  let network;
  try {
    network = await provider.getNetwork();
  } catch (error) {
    throw new Error(`Cannot connect to RPC at ${config.rpcUrl}`);
  }

  if (contractInfo.chainId && BigInt(contractInfo.chainId) !== network.chainId) {
    throw new Error(
      `Contract was deployed to chainId ${contractInfo.chainId}, but RPC is chainId ${network.chainId}`
    );
  }

  if ((await provider.getCode(contractInfo.address)) === "0x") {
    throw new Error(
      `No contract at ${contractInfo.address}. Was the node restarted? Redeploy: npm run deploy`
    );
  }

  const signer = new ethers.Wallet(config.privateKey, provider);
  const contract = new ethers.Contract(contractInfo.address, contractInfo.abi, signer);

  // Immutable election parameters, read once from the chain (source of truth).
  const electionId = (await contract.electionId()).toString();
  const candidateCount = Number(await contract.candidateCount());

  console.log("Connected to chainId", network.chainId.toString());
  console.log("Relayer account:", await signer.getAddress());
  console.log("Voting contract:", contractInfo.address);

  const { ownerContract, ownerIssue } = await connectOwner(contract, signer, provider);
  if (ownerIssue) {
    console.warn(`WARNING: admin portal phase controls are off: ${ownerIssue}`);
  }

  return {
    contract,
    ownerContract,
    ownerIssue,
    provider,
    signer,
    contractAddress: contractInfo.address,
    chainId: network.chainId.toString(),
    electionId,
    candidateCount,
    treeDepth: contractInfo.treeDepth
  };
}

// The contract instance the admin portal sends phase changes through. It must
// be signed by the contract owner, or the portal's phase controls stay off.
async function connectOwner(contract, relayer, provider) {
  if (!config.ownerPrivateKey) {
    return { ownerContract: null, ownerIssue: "OWNER_PRIVATE_KEY is not set in backend/.env" };
  }

  let owner;
  try {
    owner = new ethers.Wallet(config.ownerPrivateKey, provider);
  } catch {
    return { ownerContract: null, ownerIssue: "OWNER_PRIVATE_KEY is not a valid private key" };
  }

  const contractOwner = await contract.owner();
  if (contractOwner.toLowerCase() !== owner.address.toLowerCase()) {
    return {
      ownerContract: null,
      ownerIssue: `OWNER_PRIVATE_KEY is ${owner.address}, but the contract owner is ${contractOwner}`
    };
  }

  // Reuse the relayer's signer when it is the same account (local Hardhat).
  const sameAccount = owner.address === (await relayer.getAddress());
  console.log("Owner account:", owner.address, sameAccount ? "(same as relayer)" : "");
  return { ownerContract: sameAccount ? contract : contract.connect(owner), ownerIssue: null };
}

module.exports = { initializeBlockchain };
