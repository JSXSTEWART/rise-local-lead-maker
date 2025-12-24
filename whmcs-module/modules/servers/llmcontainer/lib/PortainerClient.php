<?php
/**
 * Portainer API Client for Container Orchestration
 * 
 * Provides interface to Portainer REST API for automated
 * container lifecycle management and stack deployment.
 * 
 * @package    WHMCS LLM Container
 * @version    1.0.0
 */

class PortainerClient
{
    private $baseUrl;
    private $username;
    private $password;
    private $jwtToken;
    private $endpointId = 1; // Default local endpoint

    public function __construct($hostname, $port, $username, $password)
    {
        $this->baseUrl = sprintf('https://%s:%d/api', $hostname, $port);
        $this->username = $username;
        $this->password = $password;
        $this->authenticate();
    }

    /**
     * Authenticate with Portainer and obtain JWT token
     */
    private function authenticate()
    {
        $response = $this->request('POST', '/auth', [
            'username' => $this->username,
            'password' => $this->password,
        ]);

        if (isset($response['jwt'])) {
            $this->jwtToken = $response['jwt'];
        } else {
            throw new Exception('Portainer authentication failed');
        }
    }

    /**
     * Deploy a new container stack
     */
    public function deployStack($tenantId, $config)
    {
        try {
            // Generate Docker Compose configuration
            $composeContent = $this->generateDockerCompose($tenantId, $config);

            // Create stack via Portainer API
            $response = $this->request('POST', "/stacks?type=2&method=string&endpointId={$this->endpointId}", [
                'Name' => $tenantId,
                'StackFileContent' => $composeContent,
                'Env' => $this->buildEnvironmentVariables($config),
            ]);

            if (!isset($response['Id'])) {
                throw new Exception('Stack creation failed: ' . json_encode($response));
            }

            // Get container ID from stack
            $stackDetails = $this->getStack($response['Id']);
            $containerId = $this->getContainerIdFromStack($stackDetails);

            return [
                'success' => true,
                'stack_id' => $response['Id'],
                'container_id' => $containerId,
            ];

        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Generate Docker Compose configuration for LLM container
     */
    private function generateDockerCompose($tenantId, $config)
    {
        $model = $this->getModelConfig($config['model']);
        $image = $this->getEngineImage($config['engine']);

        $compose = [
            'version' => '3.8',
            'services' => [
                'llm' => [
                    'image' => $image,
                    'container_name' => "{$tenantId}-llm",
                    'restart' => 'unless-stopped',
                    'environment' => [
                        'HF_TOKEN' => '${HF_TOKEN}',
                    ],
                    'command' => $this->buildCommand($config, $model),
                    'labels' => [
                        'traefik.enable' => 'true',
                        'traefik.http.routers.' . $tenantId . '.rule' => 'Host(`' . $config['subdomain'] . '`)',
                        'traefik.http.routers.' . $tenantId . '.entrypoints' => 'websecure',
                        'traefik.http.routers.' . $tenantId . '.tls.certresolver' => 'letsencrypt',
                        'traefik.http.services.' . $tenantId . '.loadbalancer.server.port' => '8000',
                    ],
                    'networks' => ['llm-network'],
                    'volumes' => [
                        $tenantId . '-model-cache:/data/model',
                        $tenantId . '-hf-cache:/root/.cache/huggingface',
                    ],
                ],
            ],
            'networks' => [
                'llm-network' => [
                    'external' => true,
                ],
            ],
            'volumes' => [
                $tenantId . '-model-cache' => null,
                $tenantId . '-hf-cache' => null,
            ],
        ];

        // Add GPU support if available
        if ($config['gpu_count'] > 0) {
            $compose['services']['llm']['deploy'] = [
                'resources' => [
                    'reservations' => [
                        'devices' => [
                            [
                                'driver' => 'nvidia',
                                'count' => $config['gpu_count'],
                                'capabilities' => ['gpu'],
                            ],
                        ],
                    ],
                ],
            ];
        }

        // Add rate limiting middleware
        if ($config['rate_limit'] > 0) {
            $compose['services']['llm']['labels']['traefik.http.routers.' . $tenantId . '.middlewares'] = 
                $tenantId . '-ratelimit';
            $compose['services']['llm']['labels']['traefik.http.middlewares.' . $tenantId . '-ratelimit.ratelimit.average'] = 
                (string)$config['rate_limit'];
        }

        return yaml_emit($compose);
    }

    /**
     * Build command array for LLM inference engine
     */
    private function buildCommand($config, $model)
    {
        switch ($config['engine']) {
            case 'vllm':
                return [
                    '--model', $model['huggingface_id'],
                    '--dtype', 'bfloat16',
                    '--gpu-memory-utilization', (string)$config['gpu_memory_util'],
                    '--max-model-len', (string)$config['max_model_len'],
                    '--port', '8000',
                ];

            case 'ollama':
                return ['serve'];

            case 'tgi':
                return [
                    '--model-id', $model['huggingface_id'],
                    '--max-input-length', (string)($config['max_model_len'] - 512),
                    '--max-total-tokens', (string)$config['max_model_len'],
                ];

            default:
                throw new Exception('Unsupported engine: ' . $config['engine']);
        }
    }

    /**
     * Get model configuration by name
     */
    private function getModelConfig($modelName)
    {
        $models = [
            'llama3-8b' => [
                'huggingface_id' => 'meta-llama/Meta-Llama-3.1-8B-Instruct',
                'vram_required' => 8,
            ],
            'llama3-70b' => [
                'huggingface_id' => 'meta-llama/Meta-Llama-3.1-70B-Instruct',
                'vram_required' => 40,
            ],
            'mistral-7b' => [
                'huggingface_id' => 'mistralai/Mistral-7B-Instruct-v0.3',
                'vram_required' => 8,
            ],
            'codellama-34b' => [
                'huggingface_id' => 'codellama/CodeLlama-34b-Instruct-hf',
                'vram_required' => 20,
            ],
            'gemma-7b' => [
                'huggingface_id' => 'google/gemma-7b-it',
                'vram_required' => 8,
            ],
        ];

        return $models[$modelName] ?? $models['llama3-8b'];
    }

    /**
     * Get Docker image for inference engine
     */
    private function getEngineImage($engine)
    {
        $images = [
            'vllm' => 'vllm/vllm-openai:v0.11.0',
            'ollama' => 'ollama/ollama:latest',
            'tgi' => 'ghcr.io/huggingface/text-generation-inference:3.3.5',
        ];

        return $images[$engine] ?? $images['vllm'];
    }

    /**
     * Build environment variables array
     */
    private function buildEnvironmentVariables($config)
    {
        $env = [];

        if (!empty($_ENV['HF_TOKEN'])) {
            $env[] = ['name' => 'HF_TOKEN', 'value' => $_ENV['HF_TOKEN']];
        }

        if ($config['enable_api_key']) {
            $env[] = ['name' => 'API_KEY', 'value' => $config['api_key']];
        }

        return $env;
    }

    /**
     * Get stack details
     */
    public function getStack($stackId)
    {
        return $this->request('GET', "/stacks/{$stackId}");
    }

    /**
     * Delete a stack
     */
    public function deleteStack($stackId)
    {
        try {
            $this->request('DELETE', "/stacks/{$stackId}?endpointId={$this->endpointId}");
            return ['success' => true];
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Start a container
     */
    public function startContainer($containerId)
    {
        try {
            $this->request('POST', "/endpoints/{$this->endpointId}/docker/containers/{$containerId}/start");
            return ['success' => true];
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Stop a container
     */
    public function stopContainer($containerId)
    {
        try {
            $this->request('POST', "/endpoints/{$this->endpointId}/docker/containers/{$containerId}/stop");
            return ['success' => true];
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Restart a container
     */
    public function restartContainer($containerId)
    {
        try {
            $this->request('POST', "/endpoints/{$this->endpointId}/docker/containers/{$containerId}/restart");
            return ['success' => true];
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Get container logs
     */
    public function getContainerLogs($containerId, $lines = 100)
    {
        $response = $this->request('GET', 
            "/endpoints/{$this->endpointId}/docker/containers/{$containerId}/logs?stdout=1&stderr=1&tail={$lines}"
        );
        return $response;
    }

    /**
     * Get container ID from stack
     */
    private function getContainerIdFromStack($stack)
    {
        // Query containers in the stack
        $containers = $this->request('GET', "/endpoints/{$this->endpointId}/docker/containers/json");
        
        foreach ($containers as $container) {
            if (isset($container['Labels']['com.docker.compose.project']) && 
                $container['Labels']['com.docker.compose.project'] === $stack['Name']) {
                return $container['Id'];
            }
        }

        throw new Exception('Container not found in stack');
    }

    /**
     * Test connection to Portainer
     */
    public function testConnection()
    {
        try {
            $this->request('GET', '/status');
            return ['success' => true];
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Make HTTP request to Portainer API
     */
    private function request($method, $endpoint, $data = null)
    {
        $url = $this->baseUrl . $endpoint;
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // For development only

        $headers = ['Content-Type: application/json'];
        
        if ($this->jwtToken) {
            $headers[] = 'Authorization: Bearer ' . $this->jwtToken;
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        if ($data !== null && in_array($method, ['POST', 'PUT', 'PATCH'])) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new Exception('cURL error: ' . $error);
        }

        if ($httpCode >= 400) {
            throw new Exception("HTTP {$httpCode}: " . $response);
        }

        return json_decode($response, true);
    }
}
