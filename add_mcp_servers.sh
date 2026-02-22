#!/bin/bash
# =============================================================================
# Add MCP Servers to Claude Code (~/.claude/config.json)
# =============================================================================

CONFIG_DIR="$HOME/.claude"
CONFIG_FILE="$CONFIG_DIR/config.json"

echo "🔧 Adding MCP servers to Claude Code configuration..."
echo ""

# Ensure ~/.claude directory exists
mkdir -p "$CONFIG_DIR"

# Create config.json if it doesn't exist, or read existing
if [ ! -f "$CONFIG_FILE" ]; then
    echo "{}" > "$CONFIG_FILE"
    echo "Created new config file: $CONFIG_FILE"
else
    echo "Found existing config: $CONFIG_FILE"
fi

# Check for jq (required for safe JSON manipulation)
if ! command -v jq &> /dev/null; then
    echo "❌ 'jq' is required but not installed."
    echo "   Install with: sudo apt install jq  (or brew install jq on macOS)"
    exit 1
fi

# Validate existing JSON
if ! jq empty "$CONFIG_FILE" 2>/dev/null; then
    echo "❌ Existing config.json is not valid JSON. Please fix it first."
    echo "   Backing up to $CONFIG_FILE.bak"
    cp "$CONFIG_FILE" "$CONFIG_FILE.bak"
    echo "{}" > "$CONFIG_FILE"
fi

# Backup current config
cp "$CONFIG_FILE" "$CONFIG_FILE.bak.$(date +%Y%m%d_%H%M%S)"
echo "📦 Backed up current config."
echo ""

# ----- Collect optional environment variables -----

read -rp "Enter your GitHub Personal Access Token (or press Enter to skip): " GITHUB_TOKEN
read -rp "Enter your PostgreSQL connection string (or press Enter to skip): " POSTGRES_URL
read -rp "Enter your Brave Search API key (or press Enter to skip): " BRAVE_API_KEY

echo ""
echo "Adding MCP servers..."

# Build the mcpServers object using jq
NEW_CONFIG=$(jq \
    --arg gh_token "$GITHUB_TOKEN" \
    --arg pg_url "$POSTGRES_URL" \
    --arg brave_key "$BRAVE_API_KEY" \
    '
    # Initialize mcpServers if it does not exist
    .mcpServers //= {} |

    # Playwright - browser testing & web scraping
    .mcpServers.playwright = {
        "command": "npx",
        "args": ["-y", "@anthropic-ai/playwright-mcp"]
    } |

    # GitHub - repo management, issues, PRs
    (if $gh_token != "" then
        .mcpServers.github = {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "env": {
                "GITHUB_PERSONAL_ACCESS_TOKEN": $gh_token
            }
        }
    else
        .mcpServers.github = {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"]
        }
    end) |

    # PostgreSQL - database queries
    (if $pg_url != "" then
        .mcpServers.postgres = {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-postgres", $pg_url]
        }
    else
        .mcpServers.postgres = {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-postgres"]
        }
    end) |

    # Filesystem - extended file access
    .mcpServers.filesystem = {
        "command": "npx",
        "args": ["-y", "@anthropic-ai/filesystem-mcp"]
    } |

    # Brave Search - real-time web search
    (if $brave_key != "" then
        .mcpServers["brave-search"] = {
            "command": "npx",
            "args": ["-y", "@anthropic-ai/brave-search-mcp"],
            "env": {
                "BRAVE_API_KEY": $brave_key
            }
        }
    else
        .mcpServers["brave-search"] = {
            "command": "npx",
            "args": ["-y", "@anthropic-ai/brave-search-mcp"]
        }
    end)
    ' "$CONFIG_FILE")

# Write the updated config
echo "$NEW_CONFIG" | jq '.' > "$CONFIG_FILE"

echo ""
echo "✅ MCP servers added successfully!"
echo ""
echo "Configured servers:"
jq -r '.mcpServers | keys[] | "   • " + .' "$CONFIG_FILE"
echo ""
echo "📄 Config file: $CONFIG_FILE"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next steps:"
echo "  1. Restart Claude Code / VS Code extension"
echo "  2. The servers will auto-start when invoked"
echo ""
echo "Tip: To bypass confirmation prompts for trusted servers:"
echo "  claude --dangerously-skip-permissions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"