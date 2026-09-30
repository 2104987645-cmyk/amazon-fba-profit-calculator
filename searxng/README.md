# SearXNG Railway deployment

This directory builds the custom SearXNG image used by Amazon Seller Workbench. It inherits `searxng/searxng:latest` and enables the JSON Search API while retaining HTML output and SearXNG default settings.

## Railway service

- Source: this GitHub repository
- Root Directory: `searxng`
- Dockerfile: `Dockerfile`
- Service name: `searxng`
- Private hostname: `searxng.railway.internal`
- Container port: `8080`

The workbench service receives this server-side environment value:

```text
SEARXNG_BASE_URL=http://searxng.railway.internal:8080
```

Expected API: `GET /search?q=test&format=json`, returning HTTP 200 with a JSON-compatible response object containing a `results` array.

## Security

- Keep this service on Railway private networking unless public debugging is explicitly needed.
- Do not put browser credentials, API keys, or a `secret_key` in `settings.yml`.
- Configure any image-required runtime secret exclusively through Railway service environment variables.
