#!/usr/bin/env bash
set -uo pipefail

PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v sui &>/dev/null; then
  echo "ERROR: sui CLI not found. Install from https://docs.sui.io/guides/developer/getting-started/sui-install"
  exit 1
fi

echo "Active env: $(sui client active-env 2>&1)"
echo "Active address: $(sui client active-address 2>&1)"
echo ""
echo "Publishing neurus_share to testnet..."

OUT=$(sui client publish "$PACKAGE_DIR" --gas-budget 100000000 --json 2>&1)
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo "ERROR: sui client publish failed (exit $STATUS):"
  echo "$OUT"
  exit 1
fi

PACKAGE_ID=$(echo "$OUT" | jq -r '.objectChanges[] | select(.type == "published") | .packageId' 2>/dev/null || true)

if [ -z "$PACKAGE_ID" ]; then
  echo "ERROR: could not find packageId in publish output:"
  echo "$OUT"
  exit 1
fi

echo "Deployed: $PACKAGE_ID"
echo ""
echo "Add to .env.local (neuron server):"
echo "  NEURUS_SEAL_PACKAGE=$PACKAGE_ID"
echo ""
echo "Also set a funded testnet signing key:"
echo "  SUI_TESTNET_PRIVATE_KEY=\$(sui keytool export --key-identity \$(sui client active-address) --json | jq -r '.exportedPrivkey')"
