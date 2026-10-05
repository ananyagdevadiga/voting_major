# Testing Guide

All commands run from the project root (`voting_major/`) unless noted.

## 1. Automated tests

```bash
npm test
```

Runs against an in-process Hardhat chain with real proofs (circuit artifacts
required: `npm run circuit:build`).

`test/Voting.test.js` – circuit and contract:

- the circuit exposes only `[root, nullifier, electionId, candidateCount, vote]`
- out-of-range votes and unregistered secrets cannot produce a proof
- a valid vote is counted for the candidate inside the proof
- duplicate nullifier, tampered vote signal and foreign Merkle root are rejected
- votes are rejected in every phase except `voting`
- phases only move forward; the root is set once and can never change; admin
  functions are owner-only

`test/Backend.test.js` – the real Express app against the contract:

- codes go only to the email on the roll; unknown voter IDs get an identical answer
- code cooldown, 5-attempt lockout, single-use tokens, per-IP rate limit
- only valid, unique commitments are stored; re-registration replaces and notifies
- every registration step is refused once registration is closed
- end to end: register → close → open → vote → duplicate rejected → end
- **privacy:** no file the server wrote and no email it sent contains a voter's
  secret in any encoding
- admin portal: no access without a session, the admin header or the right
  password; login rate limit; disabled until a password is set
- admin portal: adding voters is all-or-nothing; resets only before voting opens
- admin portal: close → open → vote → end in order; a roll change after
  publication stops `open` and republishes; phase controls stay off without the
  owner key; every action lands in the activity log

## 2. Manual end-to-end (UI)

```bash
npm run node                                  # terminal 1
npm run deploy                                # terminal 2
npm run voter:add -- you@example.com
cd backend && npm start                       # terminal 3
cd client && npm run dev                      # terminal 4
```

1. Open http://localhost:5173 → **Register to Vote** → enter `VOTER-0001`.
2. Without SMTP configured, the 6-digit code is printed in the backend terminal.
3. Enter the code. Download or copy the credential, then type it back to confirm.
4. `npm run election:close-registration`, then `npm run election:open`.
5. Reload the home page → **Cast Your Vote** → paste the credential (or load
   the downloaded file) → choose a candidate.
6. Voting again with the same credential shows "Vote Already Submitted".

## 3. Manual end-to-end (API)

With voting open, generate a proof from a registered credential:

```bash
npm run proof:generate -- <credential> 2
```

This writes `build/vote-request.json`. Then:

```bash
curl http://localhost:3000/election

# valid vote -> success, candidate 2
curl -X POST http://localhost:3000/vote -H "Content-Type: application/json" -d @build/vote-request.json

# same request again -> 409 DUPLICATE_VOTE
curl -X POST http://localhost:3000/vote -H "Content-Type: application/json" -d @build/vote-request.json

curl http://localhost:3000/results
```

Tampering check: edit `publicSignals[4]` (the vote) in
`build/vote-request.json` and resend → `400 INVALID_PROOF`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot connect to RPC` | Start the node: `npm run node` |
| `No contract at 0x…` | Node was restarted; run `npm run deploy` again (new election) |
| `REGISTRATION_CLOSED` | Election has left the registration phase; check `npm run election:status` |
| "credential is not in the voter registry" | Voter did not register before it closed, or the credential was mistyped |
| `election:open` says the roll changed | A registration or reset happened after publishing; review the new registry and run it again |
| No registration email | Without `SMTP_HOST` emails are printed in the backend console |
| `Missing required environment variable PRIVATE_KEY` | `cp backend/.env.example backend/.env` |
| Startup: config/contract mismatch | `election.config.json` changed after deploy; redeploy |
| `circom 2.x not found` | Install circom or set `CIRCOM_PATH` |
| `/admin` says "Admin portal not set up" | `cd backend && npm run admin:set-password`, then restart the backend |
| Admin portal: "Phase changes are off" | Set `OWNER_PRIVATE_KEY` in `backend/.env` to the deployer's key and restart the backend |
| Admin portal shows "Server error (404)" | The backend was started before this feature; restart it |
