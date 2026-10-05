# Secure Voting Flow

How a voter goes from the electoral roll to a counted, anonymous vote, what
each party knows at every step, and what the system does **not** protect
against.

## The one rule

**Only the voter ever knows their voting credential (the secret).**

The credential is generated in the voter's browser at registration. The
server receives only `commitment = Poseidon(secret)`, a one-way hash. Every
privacy and integrity property below depends on this rule.

## Election phases

The `Voting` contract moves through four phases, one way only:

```
Registration ──► RegistrationClosed ──► Voting ──► Ended
  voters register    registry published    root fixed,     results final
  their commitments  for audit             votes accepted
```

| Admin command | On-chain effect |
| --- | --- |
| `npm run deploy` | New election in **Registration** |
| `npm run election:close-registration` | → **RegistrationClosed**; backend refuses registrations; registry published |
| `npm run election:open` | Sets the Merkle root (once, forever) → **Voting** |
| `npm run election:end` | → **Ended** |

Because the root is set exactly once, the administrator cannot add voters while
votes are being cast.

The same steps are available in the password-protected admin portal (`/admin`),
which calls the same code and phase checks. The portal never handles a voter
secret either: there is none on the server.

## 1. Electoral roll (before the election)

```
npm run voter:add -- alice@example.com bob@example.com
```

`data/voters.json` gets one entry per eligible voter. It holds no secret:

```json
{ "voterId": "VOTER-0001", "email": "alice@example.com", "commitment": null, "registeredAt": null }
```

The administrator tells each voter their voter ID. The file contains email
addresses, so it is git-ignored.

## 2. Registration (`/register`)

```
VOTER'S BROWSER                                        SERVER
───────────────                                        ──────
1. Enter voter ID ───────────────────────────────────► POST /registration/request-code
                                                       emails a 6-digit code to the
                                                       address ON THE ROLL (the voter
                                                       cannot choose the address)

2. Enter code ───────────────────────────────────────► POST /registration/verify-code
                    ◄──────────────────────────────── 15-minute one-time token

3. Browser creates the credential:
     secret     = 16 random bytes (crypto.getRandomValues)
     commitment = Poseidon(secret)
   Voter downloads/copies it and types it back
   to confirm it was saved.

4. Send ONLY the commitment ─────────────────────────► POST /registration/commit
                                                       stores the commitment, emails
                                                       a "credential registered" notice
```

Safeguards:

- **Codes:** expire after 10 minutes, are stored only as hashes, and are
  invalidated after 5 wrong attempts. A new code can be requested once a minute.
- **Rate limit:** 30 registration requests per IP per 10 minutes.
- **No roll discovery:** a request for an unknown voter ID gets the same answer
  as a known one, so the endpoint cannot be used to find out who is on the roll.
- **Notice email:** every registration triggers one. If someone else registered
  with your code, you find out while the administrator can still reset it
  (`npm run voter:reset -- VOTER-0001`).
- **Lost credential:** the voter registers again before registration closes.
  The new commitment replaces the old one.

## 3. Registry publication (RegistrationClosed)

`election:close-registration` builds a Poseidon Merkle tree from the registered
commitments and publishes `client/public/voterProofData.json`. That file holds
voter IDs, commitments and Merkle paths only: no emails, secrets or nullifiers.

Anyone can rebuild the tree from that file and check two things: the root, and
that the number of leaves matches the number of eligible voters (to catch
"ghost" voters). `election:open` refuses to open if the roll changed after the
registry was published.

## 4. Voting (`/verify-voter` → `/vote`)

1. The voter enters their credential or loads the credential file. The browser
   finds the voter's leaf by computing `Poseidon(secret)`. Nothing is sent to
   the server.
2. The browser generates a Groth16 proof of:
   > "I know a secret whose commitment is a leaf of the tree with root R,
   > `nullifierHash = Poseidon(secret, electionId)`, and `1 ≤ vote ≤ candidateCount`."
3. The proof and public signals `[root, nullifierHash, electionId, candidateCount, vote]`
   go to `POST /vote`. The backend checks them off-chain, so invalid proofs cost
   no gas, then relays them to `Voting.castVote`.
4. The contract checks the phase, root, election, candidate range and that the
   nullifier is unused, then **verifies the proof on-chain** and counts the vote.

A second vote with the same credential produces the same nullifier and is
rejected (`DUPLICATE_VOTE`). Anyone can call `castVote` directly, so a backend
that refuses to relay a vote cannot censor it.

## Who knows what

| | Voter | Server / admin | Public (blockchain) |
| --- | --- | --- | --- |
| Secret | ✅ | ❌ | ❌ |
| Commitment ↔ voter ID | ✅ | ✅ | ✅ (published registry) |
| Nullifier | ✅ | ❌ cannot compute it | ✅ |
| Vote ↔ nullifier | ✅ | ✅ | ✅ |
| **Vote ↔ voter ID** | ✅ | **❌** | **❌** |

The last row is the purpose of the ZKP. Linking a vote to a voter needs the
nullifier for that voter, the nullifier needs the secret, and nobody but the
voter has the secret. The commitment does not help either: it never appears in
a proof, and `Poseidon(secret, electionId)` cannot be derived from
`Poseidon(secret)`.

## Security properties

| Threat | Protection |
| --- | --- |
| Admin links votes to voters | Server never has secrets → cannot compute nullifiers |
| Admin votes on someone's behalf | Needs the secret to produce a proof |
| Admin adds voters mid-election | Root fixed on-chain when voting opens |
| Someone requests another voter's code | Code goes only to the email on the roll |
| Brute-forcing a code | Hashed codes, 5 attempts, 10-minute expiry, per-IP rate limit |
| Hijacked registration | Notice email + admin reset before voting opens |
| Double voting | Nullifier stored on-chain |
| Vote altered in transit | `vote` is a public signal bound to the proof |
| Backend forges votes | Proof verified on-chain |

## Limitations (not protected)

- **Coercion / vote buying.** A voter can hand over their secret, or prove how
  they voted by revealing it, because the nullifier and vote are public on-chain.
  Preventing this needs a receipt-free design such as MACI.
- **Network metadata.** The backend sees the IP address that submits a vote.
  Voters who need to hide this can submit through Tor or call `castVote`
  directly from their own wallet.
- **Trusted setup.** The circuit build uses a locally generated, single-contributor
  Powers of Tau. Whoever ran it could forge proofs. A real election needs a
  public ceremony file (`PTAU_PATH`) and multiple phase-2 contributions.
- **Roll integrity.** The administrator decides who is on the roll and which
  email each voter ID maps to. Publishing the registry makes ghost voters
  detectable, but it does not prevent them.
- **Lost credential after registration closes.** It cannot be recovered or
  replaced, and that voter cannot vote.
