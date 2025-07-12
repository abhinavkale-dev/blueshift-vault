import * as anchor from "@coral-xyz/anchor";
import {BN, Program} from "@coral-xyz/anchor";
import { SystemProgram, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

import chai, {expect, assert, use} from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised)

import { BlueshiftAnchorVault } from "../target/types/blueshift_anchor_vault";

const provider = anchor.AnchorProvider.local();
anchor.setProvider(provider)


const program = anchor.workspace.BlueshiftAnchorVault;

async function airdrop(pubkey, sol = 10) {
  const sig = await provider.connection.requestAirdrop(
    pubkey,
    sol * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig, "confirmed")
}

describe("blueshift-anchor-vault", () => {
  const user = Keypair.generate();
  let vaultPda: PublicKey;
  let bump: number;
  let rentMin: number;

  before(async() => {
    await airdrop(user.publicKey, 10);

    [vaultPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), user.publicKey.toBuffer()],
      program.programId
    );

    rentMin = await provider.connection.getMinimumBalanceForRentExemption(0);
  });


  it("1) deposit succeeds when amount > rentMin", async () => { 
    const amount = rentMin + 500_000;

    await program.methods
      .deposit(new BN(amount))
      .accountsStrict({
        signer: user.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

      const vaultBal = await provider.connection.getBalance(vaultPda);
      assert.equal(vaultBal, amount, "vault should hold the deposited lamports");
  });

  it("2) second deposit must fail with VaultAlreadyExists", async () => { 
    try{
      await program.methods
        .deposit(new BN(rentMin + 1))
        .accountsStrict({
          signer: user.publicKey,
          vault: vaultPda,
          systemProgram: SystemProgram.programId
        })
        .signers([user])
        .rpc();
      assert.fail("Expected VaultAlreadyExists error, but deposit succeded");
    } catch(error: any) {
      const msg = error.toString();
      assert.match(msg, /VaultAlreadyExists/, `Unexpected error: ${msg}`)
    }
   });

  it("3) withdraw returns full balance", async () => { 
    const before = await provider.connection.getBalance(user.publicKey);

    await program.methods
      .withdraw()
      .accountsStrict({
        signer: user.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId
      })
      .signers([user])
      .rpc();

      const vaultBalAfter = await provider.connection.getBalance(vaultPda);
      assert.equal(vaultBalAfter, 0, "vault should be empty after withdraw");

      const after = await provider.connection.getBalance(user.publicKey);
      assert.isTrue(after > before, "user should receive lamports back");
   });

  it("4) deposit ≤ rentMin must fail with InvalidAmount", async () => { 
    try {
      await program.methods
        .deposit(new BN(rentMin))
        .accountsStrict({
          signer: user.publicKey,
          vault: vaultPda,
          systemProgram: SystemProgram.programId
        })
        .signers([user])
        .rpc();
      assert.fail("Expected InvalidAmount error, but deposit succeded");
    } catch (error: any) {
      const msg = error.toString();
      assert.match(msg, /InvalidAmount/, `Unexpected error: ${msg}`);
    }
   });
})

