# replit-agent

  OpenAI-compatible reverse proxy API that routes to OpenAI (`gpt-*`/`o*`) and Anthropic (`claude-*`) models.

  ## Features
  - OpenAI-compatible `/v1/chat/completions` & `/v1/models` endpoints
  - Streaming SSE support with tool/function calling
  - Vision / image input support
  - Dark-theme API portal frontend
  - Secured via Bearer token (`PROXY_API_KEY`)
  