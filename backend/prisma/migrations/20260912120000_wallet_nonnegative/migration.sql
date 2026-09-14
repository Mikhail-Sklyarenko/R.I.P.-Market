-- Fails deployment if historical corruption exists; never repair money silently.
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_balance_nonnegative" CHECK ("balanceMinor" >= 0);
