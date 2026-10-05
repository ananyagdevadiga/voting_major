# ZKP Online Voting System

Anonymous online voting using zero-knowledge proofs (Circom + Groth16), a
Solidity contract that verifies every proof on-chain, an Express relayer
backend, and a React client that generates proofs in the browser.

See [SECURE_VOTING_FLOW.md](SECURE_VOTING_FLOW.md) for the full flow, the
"who knows what" table and the system's limitations.

## How it works

1. **Roll** – the administrator adds eligible voters (voter ID + email).
2. **Registration** – the voter proves control of that email with a one-time
   code. Their browser then **generates the secret credential** and sends only
   its Poseidon commitment. The server never sees the secret.
3. **Registry** – registration closes and the commitments form a Merkle tree.
   Its root is fixed on-chain when voting opens.
4. **Proof** – in the browser the voter proves: *"my commitment is in the tree
   with root R, my nullifier is Poseidon(secret, electionId), and I vote for
   candidate v ∈ [1, N]"*.
5. **On-chain verification** – the backend relays the proof to the `Voting`
   contract, which checks the phase, root, election ID, candidate range and
   unused nullifier, then verifies the Groth16 proof.

Public signals: `[root, nullifierHash, electionId, candidateCount, vote]`.

| Property | Enforced by |
| --- | --- |
| Only registered voters can vote | Merkle proof in circuit + root check in contract |
| One vote per voter | Nullifier stored in contract |
| Vote cannot be changed in transit | `vote` is a public signal bound to the proof |
| Nobody (incl. the admin) can link a vote to a voter | Secret generated and kept in the voter's browser; the server only has commitments |
| Admin cannot vote for anyone or add voters mid-election | No secrets on the server; root set once when voting opens |
| Backend cannot forge votes | Proof verified on-chain |

## Project structure

```
circuits/Vote.circom        circuit (main.circom is generated from the config)
contracts/Voting.sol        voting contract (phases: registration → registration_closed → voting → ended)
contracts/Verifier.sol      generated Groth16 verifier (npm run circuit:build)
election.config.json        election ID, name, candidates, tree depth
data/voters.json            electoral roll: voter IDs, emails, commitments (git-ignored, no secrets)
data/merkle.json            published registry root
scripts/                    build, roll, deploy and election phase scripts
backend/                    Express API: registration + vote relayer
client/                     React (Vite) frontend
test/                       circuit, contract and backend API tests
```

## Requirements

- Node.js 18–22
- circom 2.x — install from https://docs.circom.io/getting-started/installation/,
  or put the binary at `tools/circom.exe` (Windows) / `tools/circom`, or set `CIRCOM_PATH`

## Setup

```bash
npm install
cd backend && npm install && cd ..
cd client && npm install && cd ..

cp backend/.env.example backend/.env      # set SMTP_* to send real emails
cp client/.env.example client/.env
```

Configure the election in `election.config.json` (candidate IDs must be
1, 2, 3, … in order; up to 255 candidates; `treeDepth` sets capacity 2^depth).

```bash
npm run setup                      # circuit:build + compile
npm test                           # circuit, contract and backend tests
```

`npm run circuit:build` is only needed again if `circuits/Vote.circom` or
`treeDepth` changes. Changing candidates or electionId only needs a redeploy.

> The circuit build generates a local single-contributor Powers of Tau. That
> is fine for development, but for a real election set `PTAU_PATH` (root
> `.env`) to a public ceremony file, e.g. `powersOfTau28_hez_final_14.ptau`.

**Email:** without `SMTP_HOST` in `backend/.env`, registration emails
(including the codes) are printed to the backend console. That mode is for
development only and refused when `NODE_ENV=production`.

## Running an election

```bash
npm run node                                    # terminal 1: local chain
npm run deploy                                  # terminal 2: new election, phase = registration
cd backend && npm start                         # terminal 3: API on :3000
cd client && npm run dev                        # terminal 4: UI on :5173
```

```bash
npm run voter:add -- alice@example.com bob@example.com   # build the roll
# voters register at http://localhost:5173/register
npm run election:close-registration             # stop registration, publish the registry
npm run election:open                           # fix the root on-chain, open voting
# voters vote at http://localhost:5173/verify-voter
npm run election:end                            # end the election
npm run election:status                         # phase, roll, root and results (any time)
```

`npm run voter:reset -- VOTER-0001` clears a voter's registration (lost
credential, or registered by someone else). It only has an effect before
voting opens.

### Admin portal

Everything above after `npm run deploy` can also be done in the browser at
http://localhost:5173/admin: add voters, reset registrations, close
registration, open voting, end the election, and watch the roll, registry,
results and an activity log. It uses the same code as the scripts, so the
same phase checks apply. One-time setup:

```bash
cd backend
npm run admin:set-password      # stores only a scrypt hash in backend/.env
```

Phase changes are sent from the contract owner's wallet, `OWNER_PRIVATE_KEY`
in `backend/.env` (the deployer — Hardhat account #0 on a local node). Without
it the portal still manages the roll, and phase changes stay in the terminal.
Sessions last 8 hours and end when the backend restarts; every admin action is
appended to `data/admin-log.jsonl`.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/status` | Server and chain status |
| GET | `/election` | Election metadata, candidates, `phase`, root |
| GET | `/results` | Votes per candidate and total |
| POST | `/registration/request-code` | `{ voterId }` → code emailed to the address on the roll |
| POST | `/registration/verify-code` | `{ voterId, code }` → `{ token, alreadyRegistered }` |
| POST | `/registration/commit` | `{ token, commitment }` → stores the commitment |
| POST | `/vote` | `{ proof, publicSignals }` |
| GET | `/admin/session` | `{ enabled, authenticated }` |
| POST | `/admin/login`, `/admin/logout` | `{ password }` → session cookie |
| GET | `/admin/overview`, `/admin/voters`, `/admin/activity` | Phase, roll, registry, results; the roll; recent admin actions |
| POST | `/admin/voters` | `{ emails: [...] }` → added to the roll (registration only) |
| POST | `/admin/voters/:voterId/reset` | Clears a registration (before voting opens) |
| POST | `/admin/election/close-registration` \| `open` \| `end` | Phase changes |

`/admin/*` (except `session` and `login`) needs the session cookie, and every
admin POST needs the header `X-SecureVote-Admin: 1`. Admin errors:
`ADMIN_AUTH_REQUIRED`, `INVALID_PASSWORD`, `ADMIN_DISABLED`, `WRONG_PHASE`,
`ROLL_CHANGED`, `NO_REGISTERED_VOTERS`, `DUPLICATE_EMAIL`, `INVALID_EMAIL`,
`ROLL_FULL`, `UNKNOWN_VOTER`, `PHASE_CONTROLS_UNAVAILABLE`.

Errors carry a `code`. Registration: `REGISTRATION_CLOSED`, `INVALID_CODE`,
`TOO_MANY_ATTEMPTS`, `INVALID_TOKEN`, `INVALID_COMMITMENT`,
`DUPLICATE_COMMITMENT`, `RATE_LIMITED`, `EMAIL_FAILED`. Voting:
`INVALID_PROOF`, `DUPLICATE_VOTE`, `UNKNOWN_ROOT`, `WRONG_ELECTION`,
`INVALID_CANDIDATE`, `VOTING_CLOSED`, `INVALID_REQUEST`.

See [TESTING.md](TESTING.md) for testing and a manual walkthrough.
