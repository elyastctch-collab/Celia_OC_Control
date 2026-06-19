param (
    [string]$Target
)

# Define models mapping
$models = @{
    "1" = "openrouter/poolside/laguna-xs.2:free"
    "2" = "openrouter/openai/gpt-oss-120b:free"
    "3" = "openrouter/moonshotai/kimi-k2.6:free"
    "4" = "google/gemini-3-flash-preview"
    "5" = "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"
    "6" = "openrouter/z-ai/glm-5.2"
    "7" = "openrouter/z-ai/glm-5.1"
    "8" = "openrouter/minimax/minimax-m3"
    "9" = "openrouter/moonshotai/kimi-k2.7-code"
}

$modelName = $models[$Target.ToLower()]
if (-not $modelName) {
    $modelName = $Target
}

Write-Output "Switching primary model to: $modelName"

# Set configuration by modifying openclaw.json directly
$configPath = Join-Path $PSScriptRoot "..\openclaw.json"
if (Test-Path $configPath) {
    $config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
    $config.agents.defaults.model.primary = $modelName
    $config | ConvertTo-Json -Depth 10 | Set-Content -Path $configPath
    Write-Output "Config file updated successfully."
} else {
    Write-Output "Warning: openclaw.json config file not found at $configPath"
}
