<?php
/**
 * WHMCS LLM Container Provisioning Module
 * 
 * Automates deployment of customer-provisioned LLM inference containers
 * through WHMCS billing using Portainer API for container orchestration.
 * 
 * @package    WHMCS
 * @author     Rise Local Lead Maker
 * @copyright  2025
 * @license    MIT
 * @version    1.0.0
 */

if (!defined("WHMCS")) {
    die("This file cannot be accessed directly");
}

require_once __DIR__ . '/lib/PortainerClient.php';
require_once __DIR__ . '/lib/LLMMetricsProvider.php';

/**
 * Module metadata
 */
function llmcontainer_MetaData()
{
    return [
        'DisplayName' => 'LLM Container Provisioning',
        'APIVersion' => '1.1',
        'RequiresServer' => true,
        'DefaultNonSSLPort' => '9000',
        'DefaultSSLPort' => '9443',
        'ServiceSingleSignOnLabel' => 'Access Container Dashboard',
    ];
}

/**
 * Module configuration options
 */
function llmcontainer_ConfigOptions()
{
    return [
        'model' => [
            'FriendlyName' => 'LLM Model',
            'Type' => 'dropdown',
            'Options' => [
                'llama3-8b' => 'Llama 3 8B (8GB VRAM)',
                'llama3-70b' => 'Llama 3 70B (40GB VRAM)',
                'mistral-7b' => 'Mistral 7B (8GB VRAM)',
                'codellama-34b' => 'Code Llama 34B (20GB VRAM)',
                'gemma-7b' => 'Gemma 7B (8GB VRAM)',
            ],
            'Default' => 'llama3-8b',
            'Description' => 'LLM model to deploy',
        ],
        'gpu_count' => [
            'FriendlyName' => 'GPU Count',
            'Type' => 'text',
            'Size' => '5',
            'Default' => '1',
            'Description' => 'Number of GPUs to allocate',
        ],
        'max_model_len' => [
            'FriendlyName' => 'Max Context Length',
            'Type' => 'text',
            'Size' => '10',
            'Default' => '8192',
            'Description' => 'Maximum context window (tokens)',
        ],
        'gpu_memory_util' => [
            'FriendlyName' => 'GPU Memory Utilization',
            'Type' => 'text',
            'Size' => '5',
            'Default' => '0.9',
            'Description' => 'GPU memory utilization (0.0-1.0)',
        ],
        'engine' => [
            'FriendlyName' => 'Inference Engine',
            'Type' => 'dropdown',
            'Options' => [
                'vllm' => 'vLLM (High Performance)',
                'ollama' => 'Ollama (Lightweight)',
                'tgi' => 'Text Generation Inference',
            ],
            'Default' => 'vllm',
            'Description' => 'LLM inference server',
        ],
        'enable_api_key' => [
            'FriendlyName' => 'Enable API Key Auth',
            'Type' => 'yesno',
            'Default' => 'yes',
            'Description' => 'Require API key for all requests',
        ],
        'rate_limit' => [
            'FriendlyName' => 'Rate Limit (req/sec)',
            'Type' => 'text',
            'Size' => '5',
            'Default' => '100',
            'Description' => 'Maximum requests per second',
        ],
    ];
}

/**
 * Create a new LLM container instance
 */
function llmcontainer_CreateAccount(array $params)
{
    try {
        logModuleCall('llmcontainer', __FUNCTION__, $params, '', '', [$params['password']]);

        $portainer = new PortainerClient(
            $params['serverhostname'],
            $params['serverport'],
            $params['serverusername'],
            $params['serverpassword']
        );

        // Generate unique tenant identifier
        $tenantId = 'tenant-' . strtolower($params['domain']);
        $tenantId = preg_replace('/[^a-z0-9-]/', '', $tenantId);

        // Generate API key for client
        $apiKey = bin2hex(random_bytes(32));

        // Prepare container configuration
        $config = [
            'model' => $params['configoption1'],
            'gpu_count' => (int)$params['configoption2'],
            'max_model_len' => (int)$params['configoption3'],
            'gpu_memory_util' => (float)$params['configoption4'],
            'engine' => $params['configoption5'],
            'enable_api_key' => $params['configoption6'] === 'on',
            'rate_limit' => (int)$params['configoption7'],
            'tenant_id' => $tenantId,
            'api_key' => $apiKey,
            'subdomain' => $tenantId . '.' . $params['serverhostname'],
        ];

        // Deploy container stack via Portainer
        $result = $portainer->deployStack($tenantId, $config);

        if (!$result['success']) {
            return $result['error'];
        }

        // Store container metadata in service properties
        $service = \WHMCS\Service\Service::find($params['serviceid']);
        $service->serviceProperties->save([
            'Stack ID' => $result['stack_id'],
            'Container ID' => $result['container_id'],
            'API Key Hash' => password_hash($apiKey, PASSWORD_BCRYPT),
            'API Endpoint' => 'https://' . $config['subdomain'],
            'Tenant ID' => $tenantId,
        ]);

        // Return success with client-facing information
        return [
            'success' => true,
            'apiKey' => $apiKey, // Only shown once during creation
            'endpoint' => 'https://' . $config['subdomain'],
        ];

    } catch (Exception $e) {
        logModuleCall('llmcontainer', __FUNCTION__, $params, $e->getMessage(), $e->getTraceAsString());
        return $e->getMessage();
    }
}

/**
 * Suspend an LLM container instance
 */
function llmcontainer_SuspendAccount(array $params)
{
    try {
        logModuleCall('llmcontainer', __FUNCTION__, $params, '', '');

        $portainer = new PortainerClient(
            $params['serverhostname'],
            $params['serverport'],
            $params['serverusername'],
            $params['serverpassword']
        );

        $service = \WHMCS\Service\Service::find($params['serviceid']);
        $containerId = $service->serviceProperties->get('Container ID');

        $result = $portainer->stopContainer($containerId);

        return $result['success'] ? 'success' : $result['error'];

    } catch (Exception $e) {
        logModuleCall('llmcontainer', __FUNCTION__, $params, $e->getMessage());
        return $e->getMessage();
    }
}

/**
 * Unsuspend an LLM container instance
 */
function llmcontainer_UnsuspendAccount(array $params)
{
    try {
        logModuleCall('llmcontainer', __FUNCTION__, $params, '', '');

        $portainer = new PortainerClient(
            $params['serverhostname'],
            $params['serverport'],
            $params['serverusername'],
            $params['serverpassword']
        );

        $service = \WHMCS\Service\Service::find($params['serviceid']);
        $containerId = $service->serviceProperties->get('Container ID');

        $result = $portainer->startContainer($containerId);

        return $result['success'] ? 'success' : $result['error'];

    } catch (Exception $e) {
        logModuleCall('llmcontainer', __FUNCTION__, $params, $e->getMessage());
        return $e->getMessage();
    }
}

/**
 * Terminate an LLM container instance
 */
function llmcontainer_TerminateAccount(array $params)
{
    try {
        logModuleCall('llmcontainer', __FUNCTION__, $params, '', '');

        $portainer = new PortainerClient(
            $params['serverhostname'],
            $params['serverport'],
            $params['serverusername'],
            $params['serverpassword']
        );

        $service = \WHMCS\Service\Service::find($params['serviceid']);
        $stackId = $service->serviceProperties->get('Stack ID');

        $result = $portainer->deleteStack($stackId);

        return $result['success'] ? 'success' : $result['error'];

    } catch (Exception $e) {
        logModuleCall('llmcontainer', __FUNCTION__, $params, $e->getMessage());
        return $e->getMessage();
    }
}

/**
 * Test connection to Portainer server
 */
function llmcontainer_TestConnection(array $params)
{
    try {
        $portainer = new PortainerClient(
            $params['serverhostname'],
            $params['serverport'],
            $params['serverusername'],
            $params['serverpassword']
        );

        $result = $portainer->testConnection();

        return [
            'success' => $result['success'],
            'error' => $result['error'] ?? '',
        ];

    } catch (Exception $e) {
        return [
            'success' => false,
            'error' => $e->getMessage(),
        ];
    }
}

/**
 * Client area output
 */
function llmcontainer_ClientArea(array $params)
{
    try {
        $service = \WHMCS\Service\Service::find($params['serviceid']);
        
        $apiEndpoint = $service->serviceProperties->get('API Endpoint');
        $tenantId = $service->serviceProperties->get('Tenant ID');
        $stackId = $service->serviceProperties->get('Stack ID');

        // Get usage metrics
        $metricsProvider = new LLMMetricsProvider($params);
        $metrics = $metricsProvider->getUsageMetrics($tenantId);

        return [
            'templatefile' => 'templates/clientarea',
            'vars' => [
                'api_endpoint' => $apiEndpoint,
                'tenant_id' => $tenantId,
                'stack_id' => $stackId,
                'gpu_hours' => $metrics['gpu_hours'] ?? 0,
                'inference_tokens' => $metrics['inference_tokens'] ?? 0,
                'request_count' => $metrics['request_count'] ?? 0,
                'model' => $params['configoption1'],
                'engine' => $params['configoption5'],
            ],
        ];

    } catch (Exception $e) {
        logModuleCall('llmcontainer', __FUNCTION__, $params, $e->getMessage());
        return ['templatefile' => 'templates/error', 'vars' => ['error' => $e->getMessage()]];
    }
}

/**
 * Admin services tab output
 */
function llmcontainer_AdminServicesTabFields(array $params)
{
    try {
        $service = \WHMCS\Service\Service::find($params['serviceid']);
        
        $fields = [
            'Stack ID' => $service->serviceProperties->get('Stack ID'),
            'Container ID' => $service->serviceProperties->get('Container ID'),
            'API Endpoint' => $service->serviceProperties->get('API Endpoint'),
            'Tenant ID' => $service->serviceProperties->get('Tenant ID'),
        ];

        return $fields;

    } catch (Exception $e) {
        return ['Error' => $e->getMessage()];
    }
}

/**
 * Admin custom button - Restart Container
 */
function llmcontainer_AdminCustomButtonArray()
{
    return [
        'Restart Container' => 'restartContainer',
        'View Logs' => 'viewLogs',
        'Reset API Key' => 'resetApiKey',
    ];
}

/**
 * Restart container action
 */
function llmcontainer_restartContainer(array $params)
{
    try {
        $portainer = new PortainerClient(
            $params['serverhostname'],
            $params['serverport'],
            $params['serverusername'],
            $params['serverpassword']
        );

        $service = \WHMCS\Service\Service::find($params['serviceid']);
        $containerId = $service->serviceProperties->get('Container ID');

        $result = $portainer->restartContainer($containerId);

        return $result['success'] ? 'success' : $result['error'];

    } catch (Exception $e) {
        return 'Error: ' . $e->getMessage();
    }
}

/**
 * View container logs
 */
function llmcontainer_viewLogs(array $params)
{
    try {
        $portainer = new PortainerClient(
            $params['serverhostname'],
            $params['serverport'],
            $params['serverusername'],
            $params['serverpassword']
        );

        $service = \WHMCS\Service\Service::find($params['serviceid']);
        $containerId = $service->serviceProperties->get('Container ID');

        $logs = $portainer->getContainerLogs($containerId, 100);

        return 'Container Logs:<br><pre>' . htmlspecialchars($logs) . '</pre>';

    } catch (Exception $e) {
        return 'Error: ' . $e->getMessage();
    }
}

/**
 * Reset API key
 */
function llmcontainer_resetApiKey(array $params)
{
    try {
        $newApiKey = bin2hex(random_bytes(32));
        
        $service = \WHMCS\Service\Service::find($params['serviceid']);
        $service->serviceProperties->save([
            'API Key Hash' => password_hash($newApiKey, PASSWORD_BCRYPT),
        ]);

        return 'New API Key: ' . $newApiKey . '<br><strong>Save this key - it will not be shown again!</strong>';

    } catch (Exception $e) {
        return 'Error: ' . $e->getMessage();
    }
}

/**
 * Usage metrics for billing
 */
function llmcontainer_UsageUpdate($params)
{
    try {
        $metricsProvider = new LLMMetricsProvider($params);
        $service = \WHMCS\Service\Service::find($params['serviceid']);
        $tenantId = $service->serviceProperties->get('Tenant ID');

        return $metricsProvider->collectMetrics($tenantId);

    } catch (Exception $e) {
        logModuleCall('llmcontainer', __FUNCTION__, $params, $e->getMessage());
        return [];
    }
}
