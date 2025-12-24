<div class="panel panel-default">
    <div class="panel-heading">
        <h3 class="panel-title">
            <i class="fas fa-robot"></i> LLM Container Information
        </h3>
    </div>
    <div class="panel-body">
        <div class="row">
            <div class="col-md-6">
                <h4>Connection Details</h4>
                <table class="table table-striped">
                    <tr>
                        <td><strong>API Endpoint:</strong></td>
                        <td><code>{$api_endpoint}</code></td>
                    </tr>
                    <tr>
                        <td><strong>Tenant ID:</strong></td>
                        <td><code>{$tenant_id}</code></td>
                    </tr>
                    <tr>
                        <td><strong>Model:</strong></td>
                        <td>{$model}</td>
                    </tr>
                    <tr>
                        <td><strong>Engine:</strong></td>
                        <td>{$engine}</td>
                    </tr>
                </table>
            </div>
            <div class="col-md-6">
                <h4>Current Month Usage</h4>
                <table class="table table-striped">
                    <tr>
                        <td><strong>GPU Hours:</strong></td>
                        <td>{$gpu_hours|number_format:2} hours</td>
                    </tr>
                    <tr>
                        <td><strong>Tokens Processed:</strong></td>
                        <td>{$inference_tokens|number_format:0} tokens</td>
                    </tr>
                    <tr>
                        <td><strong>API Requests:</strong></td>
                        <td>{$request_count|number_format:0} requests</td>
                    </tr>
                </table>
            </div>
        </div>

        <hr>

        <h4>API Quick Start</h4>
        <p>Use your LLM container with OpenAI-compatible API:</p>
        
        <div class="alert alert-info">
            <strong>Python Example:</strong>
            <pre>from openai import OpenAI

client = OpenAI(
    base_url="{$api_endpoint}/v1",
    api_key="your-api-key-here"
)

response = client.chat.completions.create(
    model="llama3",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)
print(response.choices[0].message.content)</pre>
        </div>

        <div class="alert alert-info">
            <strong>cURL Example:</strong>
            <pre>curl {$api_endpoint}/v1/chat/completions \
  -H "Authorization: Bearer YOUR-API-KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'</pre>
        </div>

        <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle"></i>
            <strong>Important:</strong> Keep your API key secure. Do not commit it to version control or share it publicly.
        </div>

        <h4>Supported Endpoints</h4>
        <ul>
            <li><code>POST /v1/chat/completions</code> - Chat completion</li>
            <li><code>POST /v1/completions</code> - Text completion</li>
            <li><code>POST /v1/embeddings</code> - Generate embeddings</li>
            <li><code>GET /v1/models</code> - List available models</li>
        </ul>

        <p class="text-muted">
            For full API documentation, visit the 
            <a href="https://platform.openai.com/docs/api-reference" target="_blank">OpenAI API Reference</a>
        </p>
    </div>
</div>
