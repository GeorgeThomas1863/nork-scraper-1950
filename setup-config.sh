# Default directory
CONFIG_DIR="config"

# Get the repo URL from the first parameter
if [ -z "$1" ]; then
    echo "Error: You must provide a repository URL"
    exit 1
fi

# Set the repo URL from the first parameter
REPO_URL="$1"

echo "Using repository: $REPO_URL"
echo "Config will be stored in: $CONFIG_DIR"

# Check if config directory exists
if [ -d "$CONFIG_DIR" ]; then
    echo "Config directory already exists. Updating..."
    cd $CONFIG_DIR
    git pull
    cd ..
else
    echo "Cloning config repository..."
    git clone $REPO_URL $CONFIG_DIR
fi

echo "Configuration setup complete!"