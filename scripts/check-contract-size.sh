#!/bin/bash
# Contract Size Checker
# Checks if contracts are within EIP-170 24KB limit

echo "🔍 Checking Contract Sizes..."
echo ""

MAX_SIZE=24576
WARNING_THRESHOLD=23000  # Warn if > 23KB (94%)

# Compile first
echo "📦 Compiling contracts..."
npm run compile > /dev/null 2>&1

echo ""
echo "📊 Contract Size Report:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for contract in artifacts/contracts/**/*.json; do
    # Skip build-info files
    if [[ $contract == *"build-info"* ]]; then
        continue
    fi

    # Skip .dbg.json files
    if [[ $contract == *".dbg.json"* ]]; then
        continue
    fi

    # Get contract name
    name=$(basename "$contract" .json)

    # Get deployed bytecode size (divide by 2 since it's hex, subtract 2 for 0x)
    size=$(cat "$contract" | jq -r '.deployedBytecode' | wc -c)
    size=$((($size - 2) / 2))

    # Skip if size is 0 (interface or abstract)
    if [ $size -eq 0 ]; then
        continue
    fi

    # Calculate percentage
    percentage=$(echo "scale=2; ($size * 100) / $MAX_SIZE" | bc)
    remaining=$(($MAX_SIZE - $size))

    # Color coding
    if [ $size -ge $MAX_SIZE ]; then
        status="🔴 EXCEEDS LIMIT"
        color="\033[0;31m"  # Red
    elif [ $size -ge $WARNING_THRESHOLD ]; then
        status="⚠️  WARNING"
        color="\033[0;33m"  # Yellow
    else
        status="✅ OK"
        color="\033[0;32m"  # Green
    fi

    # Reset color
    nc="\033[0m"

    printf "${color}%-30s %6d bytes (%5.2f%%) [%6d bytes left] %s${nc}\n" \
        "$name" "$size" "$percentage" "$remaining" "$status"
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📏 EIP-170 Limit: $MAX_SIZE bytes (24 KB)"
echo ""
echo "Legend:"
echo "  ✅ OK       - Contract is comfortably under limit"
echo "  ⚠️  WARNING - Contract is close to limit (>94%)"
echo "  🔴 EXCEEDS  - Contract exceeds limit and cannot be deployed"
echo ""
