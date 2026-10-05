pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// Recomputes a Merkle root from a leaf and its authentication path.
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal hashes[levels + 1];
    signal left[levels];
    signal right[levels];

    signal leftPart1[levels];
    signal leftPart2[levels];
    signal rightPart1[levels];
    signal rightPart2[levels];

    component poseidons[levels];

    hashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        leftPart1[i] <== (1 - pathIndices[i]) * hashes[i];
        leftPart2[i] <== pathIndices[i] * pathElements[i];
        left[i] <== leftPart1[i] + leftPart2[i];

        rightPart1[i] <== pathIndices[i] * hashes[i];
        rightPart2[i] <== (1 - pathIndices[i]) * pathElements[i];
        right[i] <== rightPart1[i] + rightPart2[i];

        poseidons[i] = Poseidon(2);
        poseidons[i].inputs[0] <== left[i];
        poseidons[i].inputs[1] <== right[i];

        hashes[i + 1] <== poseidons[i].out;
    }

    root <== hashes[levels];
}

/*
 * Proves: "I know a secret whose commitment Poseidon(secret) is a leaf of the
 * voter tree with this root, this is my nullifier for this election, and I
 * vote for candidate `vote` in [1, candidateCount]".
 *
 * Public signal order (declaration order): root, nullifierHash, electionId,
 * candidateCount, vote. The commitment is never revealed.
 */
template Vote(levels) {
    // ---------- public ----------
    signal input root;
    signal input nullifierHash;
    signal input electionId;
    signal input candidateCount;
    signal input vote;

    // ---------- private ----------
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Commitment stays internal so the proof cannot be linked to a voter.
    component commitmentHasher = Poseidon(1);
    commitmentHasher.inputs[0] <== secret;

    component treeChecker = MerkleTreeChecker(levels);
    treeChecker.leaf <== commitmentHasher.out;

    for (var i = 0; i < levels; i++) {
        treeChecker.pathElements[i] <== pathElements[i];
        treeChecker.pathIndices[i] <== pathIndices[i];
    }

    treeChecker.root === root;

    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== electionId;
    nullifierHasher.out === nullifierHash;

    // Comparators are only sound for range-checked inputs: both fit in 8 bits.
    component voteBits = Num2Bits(8);
    voteBits.in <== vote;
    component countBits = Num2Bits(8);
    countBits.in <== candidateCount;

    // 1 <= vote <= candidateCount (up to 255 candidates)
    component voteAtLeastOne = GreaterEqThan(8);
    voteAtLeastOne.in[0] <== vote;
    voteAtLeastOne.in[1] <== 1;
    voteAtLeastOne.out === 1;

    component voteInRange = LessEqThan(8);
    voteInRange.in[0] <== vote;
    voteInRange.in[1] <== candidateCount;
    voteInRange.out === 1;
}
