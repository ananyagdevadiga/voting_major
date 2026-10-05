/*
 * Deploys Groth16Verifier + Voting using election.config.json and writes
 * contractAddress.json (address + ABI + election parameters) for the backend.
 *
 * The election starts in the Registration phase. Then:
 *   npm run election:close-registration   publish the registry for audit
 *   npm run election:open                 fix the root on-chain, open voting
 *   npm run election:end                  end the election
 *
 * Usage: npx hardhat run scripts/deploy.js --network localhost
 */
const hre = require("hardhat");
const { PATHS, writeJson, loadElectionConfig } = require("./lib/common");

async function main() {
  const config = loadElectionConfig();
  const candidateCount = config.candidates.length;
  const network = await hre.ethers.provider.getNetwork();

  console.log(`Deploying to ${hre.network.name} (chainId ${network.chainId})...`);

  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.deployed();
  console.log("Groth16Verifier:", verifier.address);

  const Voting = await hre.ethers.getContractFactory("Voting");
  const voting = await Voting.deploy(verifier.address, config.electionId, candidateCount);
  await voting.deployed();
  console.log("Voting:", voting.address);

  const abi = JSON.parse(
    voting.interface.format(hre.ethers.utils.FormatTypes.json)
  );

  writeJson(PATHS.contractInfo, {
    address: voting.address,
    verifierAddress: verifier.address,
    network: hre.network.name,
    chainId: network.chainId,
    electionId: String(config.electionId),
    candidateCount,
    treeDepth: config.treeDepth,
    deployedAt: new Date().toISOString(),
    abi
  });

  console.log("\nSaved contractAddress.json");
  console.log(`Election ${config.electionId}: ${candidateCount} candidates`);
  console.log("Phase: registration — voters can now register at /register");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error.message);
    process.exit(1);
  });
